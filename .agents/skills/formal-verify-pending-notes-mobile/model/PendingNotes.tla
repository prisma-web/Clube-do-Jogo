---------------------------- MODULE PendingNotes ----------------------------
(***************************************************************************)
(* Durability of the mobile pending-notes queue for ONE AsyncStorage key, *)
(* pendingNotesKey(userId, gameId). Every action names the code it models. *)
(*   apps/mobile/src/state/discussion-queries.ts  useNotesPendingQueue,    *)
(*                                                enqueueDraftWrite        *)
(*   apps/mobile/src/state/notes-queue.ts         enqueue/dequeue/...      *)
(*   apps/mobile/src/features/notes/PrivateNotes.tsx  what the user can do *)
(*   packages/data/src/notes.ts                   create/update on server  *)
(***************************************************************************)
EXTENDS Integers, Sequences, FiniteSets, TLC

CONSTANTS
    Lifetimes,         \* hook lifetimes of useNotesPendingQueue for this key
    MaxMounted,        \* PrivateNotes for the same game mounted at once
    QuiescentUnmount,  \* TRUE: a screen is left only when no flushOne is awaiting
    MaxIds, MaxRevs, MaxChain, MaxCrashes, MaxForeign,
    Variant            \* "none", or a broken variant that shows the check can fail

ASSUME Variant \in {"none", "drop-on-conflict", "no-load-wait", "unserialized-writes", "use-local-drops",
                    "no-rerun"}

NoteIds == 1..MaxIds
Revs    == 1..MaxRevs   \* one per "Salvar anotação" tap: the text the user sent
Foreign == 0            \* a row written by another device
None    == -1
NoEntry == [rev |-> None, upd |-> FALSE, exp |-> None]
NoReq   == [entry |-> NoEntry, phase |-> "none"]
EmptyQ  == [n \in NoteIds |-> NoEntry]

VARIABLES
    stored,     \* AsyncStorage value under pendingNotesKey
    chain,      \* draftWrites.get(key): queue snapshots waiting to land, in order
    server,     \* game_notes row per id: a rev, Foreign, or None
    serverHad,  \* revs the server has accepted at least once
    status,     \* per lifetime: idle | mounted | unmounted | dead
    stack,      \* mounted lifetimes; the last one is the screen the user touches
    loaded,     \* loadedKey === key
    loadWait,   \* writes that must land before the load's getItem runs
    mem,        \* queueRef.current
    conflict,   \* conflictsRef.current: none | changed | deleted
    req,        \* flushingRef plus the client.create/update call it awaits
    rerun,      \* createFlushGate: notes whose awaiting send got another trigger
    trigd,      \* ghost: the same triggers, kept even by the "no-rerun" variant
    missed,     \* ghost: notes whose trigger was dropped with the note still queued
    usedIds, nextRev, durable, discarded, crashes, foreigns

vars == <<stored, chain, server, serverHad, status, stack, loaded, loadWait,
          mem, conflict, req, rerun, trigd, missed,
          usedIds, nextRev, durable, discarded, crashes, foreigns>>

retryVars == <<rerun, trigd, missed>>

Entry == [rev : Revs, upd : BOOLEAN, exp : Revs \cup {Foreign, None}] \cup {NoEntry}
Queue == [NoteIds -> Entry]
Phase == {"none", "sent", "ok", "changed", "deleted"}

RevsIn(q) == {q[n].rev : n \in {m \in NoteIds : q[m] /= NoEntry}}

TypeOK ==
    /\ stored \in Queue
    /\ \A k \in 1..Len(chain) : chain[k] \in Queue
    /\ server \in [NoteIds -> Revs \cup {Foreign, None}]
    /\ status \in [Lifetimes -> {"idle", "mounted", "unmounted", "dead"}]
    /\ mem \in [Lifetimes -> Queue]
    /\ conflict \in [Lifetimes -> [NoteIds -> {"none", "changed", "deleted"}]]
    /\ \A l \in Lifetimes, n \in NoteIds : req[l][n].phase \in Phase
    /\ rerun \in [Lifetimes -> SUBSET NoteIds]
    /\ trigd \in [Lifetimes -> SUBSET NoteIds]
    /\ missed \subseteq NoteIds

\* THE PROPERTY. Once a sent note has landed in AsyncStorage, it stays there
\* until the server has accepted it or the user discarded it in a conflict.
NoLostNote ==
    \A r \in durable : r \in serverHad \/ r \in RevsIn(stored) \/ r \in discarded

\* Bug "a fila trava depois que a rede volta": a flush trigger (reconnect, focus,
\* "Sincronizar novamente") that arrives while the note's send is still awaiting
\* is not lost. When that send settles with the note still queued and not in
\* conflict, the note is sent again in the same step.
NoLostRetry == missed = {}

Init ==
    /\ stored = EmptyQ
    /\ chain = <<>>
    /\ server = [n \in NoteIds |-> None]
    /\ serverHad = {}
    /\ status = [l \in Lifetimes |-> "idle"]
    /\ stack = <<>>
    /\ loaded = [l \in Lifetimes |-> FALSE]
    /\ loadWait = [l \in Lifetimes |-> 0]
    /\ mem = [l \in Lifetimes |-> EmptyQ]
    /\ conflict = [l \in Lifetimes |-> [n \in NoteIds |-> "none"]]
    /\ req = [l \in Lifetimes |-> [n \in NoteIds |-> NoReq]]
    /\ rerun = [l \in Lifetimes |-> {}]
    /\ trigd = [l \in Lifetimes |-> {}]
    /\ missed = {}
    /\ usedIds = {}
    /\ nextRev = 1
    /\ durable = {}
    /\ discarded = {}
    /\ crashes = 0
    /\ foreigns = 0

\* PrivateNotes: only the screen on top takes input, and `busy` blocks the
\* composer until the queue has loaded.
Touchable(l) == stack /= <<>> /\ stack[Len(stack)] = l /\ loaded[l]

\* randomUUID(): a fresh id. Taking the smallest unused one is a symmetry cut.
FreshId == CHOOSE n \in NoteIds \ usedIds : \A m \in NoteIds \ usedIds : n <= m

\* applyQueue: queueRef.current = q, then enqueueDraftWrite(key, setItem or
\* removeItem) appends the whole snapshot to the key's write chain.
Apply(l, q) ==
    /\ mem' = [mem EXCEPT ![l] = q]
    /\ chain' = Append(chain, q)

\* flushOne up to its first await: return when in conflict or not queued; when
\* a send is already awaiting, flushGate.begin keeps the trigger instead.
Send(l, n, q, c) ==
    IF req[l][n] = NoReq /\ c[n] = "none" /\ q[n] /= NoEntry
    THEN [req[l] EXCEPT ![n] = [entry |-> q[n], phase |-> "sent"]]
    ELSE req[l]

\* The notes of a flushOne/flushAll call that meet a send still awaiting.
InFlightTrigger(l, n, q, c) == req[l][n] /= NoReq /\ c[n] = "none" /\ q[n] /= NoEntry

\* flushGate.begin returning false: rerun remembers the trigger. The variant
\* "no-rerun" is the code before the fix, which skipped it (flushingRef.has).
RecordTriggers(l, S) ==
    /\ rerun' = IF Variant = "no-rerun" THEN rerun ELSE [rerun EXCEPT ![l] = @ \cup S]
    /\ trigd' = [trigd EXCEPT ![l] = @ \cup S]
    /\ UNCHANGED missed

TriggerOn(l, n, q, c) == RecordTriggers(l, IF InFlightTrigger(l, n, q, c) THEN {n} ELSE {})

\* The finally of flushOne, in the same step as the response: flushGate.finish
\* and, when a trigger came meanwhile, flushOne again over the new queue q and
\* conflicts c (it returns at once for a dequeued or conflicted note).
Settle(l, n, q, c) ==
    LET r0    == [req[l] EXCEPT ![n] = NoReq]
        again == n \in rerun[l] /\ c[n] = "none" /\ q[n] /= NoEntry
        lost  == n \in trigd[l] /\ c[n] = "none" /\ q[n] /= NoEntry /\ ~again
    IN /\ req' = [req EXCEPT ![l] = IF again THEN [r0 EXCEPT ![n] = [entry |-> q[n], phase |-> "sent"]] ELSE r0]
       /\ rerun' = [rerun EXCEPT ![l] = @ \ {n}]
       /\ trigd' = [trigd EXCEPT ![l] = @ \ {n}]
       /\ missed' = IF lost THEN missed \cup {n} ELSE missed

---------------------------------------------------------------------------
\* Lifecycle of the PrivateNotes / NotesEditor that owns the hook.

\* Mount: the load effect waits for draftWrites.get(key), then getItem.
Mount(l) ==
    /\ status[l] = "idle"
    /\ Len(stack) < MaxMounted
    /\ status' = [status EXCEPT ![l] = "mounted"]
    /\ stack' = Append(stack, l)
    /\ loadWait' = [loadWait EXCEPT ![l] = IF Variant = "no-load-wait" THEN 0 ELSE Len(chain)]
    /\ UNCHANGED <<stored, chain, server, serverHad, loaded, mem, conflict, req,
                   usedIds, nextRev, durable, discarded, crashes, foreigns>>
    /\ UNCHANGED retryVars

\* The getItem result: parseQueue(value) becomes queueRef.current.
LoadRead(l) ==
    /\ status[l] = "mounted" /\ ~loaded[l] /\ loadWait[l] = 0
    /\ mem' = [mem EXCEPT ![l] = stored]
    /\ loaded' = [loaded EXCEPT ![l] = TRUE]
    /\ UNCHANGED <<stored, chain, server, serverHad, status, stack, loadWait,
                   conflict, req, usedIds, nextRev, durable, discarded, crashes, foreigns>>
    /\ UNCHANGED retryVars

\* Back, or a sub-tab switch. The online/focus listeners go away, but a
\* flushOne that is still awaiting keeps its closure over queueRef and key.
Unmount(l) ==
    /\ stack /= <<>> /\ stack[Len(stack)] = l
    /\ QuiescentUnmount => \A n \in NoteIds : req[l][n] = NoReq
    /\ status' = [status EXCEPT ![l] = "unmounted"]
    /\ stack' = SubSeq(stack, 1, Len(stack) - 1)
    /\ UNCHANGED <<stored, chain, server, serverHad, loaded, loadWait, mem, conflict,
                   req, usedIds, nextRev, durable, discarded, crashes, foreigns>>
    /\ UNCHANGED retryVars

\* The OS kills the app: memory and writes that have not landed are gone.
\* Requests already on the wire may still reach the server (Reach).
Crash ==
    /\ crashes < MaxCrashes
    /\ \E l \in Lifetimes : status[l] \in {"mounted", "unmounted"}
    /\ status' = [l \in Lifetimes |-> IF status[l] \in {"mounted", "unmounted"} THEN "dead" ELSE status[l]]
    /\ stack' = <<>>
    /\ chain' = <<>>
    /\ loadWait' = [l \in Lifetimes |-> 0]
    /\ crashes' = crashes + 1
    /\ rerun' = [l \in Lifetimes |-> {}]
    /\ trigd' = [l \in Lifetimes |-> {}]
    /\ UNCHANGED missed
    /\ UNCHANGED <<stored, server, serverHad, loaded, mem, conflict, req,
                   usedIds, nextRev, durable, discarded, foreigns>>

\* AsyncStorage applies the oldest pending write (enqueueDraftWrite chains them).
Land ==
    /\ chain /= <<>>
    /\ \E k \in 1..Len(chain) :
         /\ k = 1 \/ Variant = "unserialized-writes"
         /\ stored' = chain[k]
         /\ chain' = [j \in 1..(Len(chain) - 1) |-> IF j < k THEN chain[j] ELSE chain[j + 1]]
         /\ durable' = durable \cup RevsIn(chain[k])
    /\ loadWait' = [l \in Lifetimes |-> IF loadWait[l] > 0 THEN loadWait[l] - 1 ELSE 0]
    /\ UNCHANGED <<server, serverHad, status, stack, loaded, mem, conflict, req,
                   usedIds, nextRev, discarded, crashes, foreigns>>
    /\ UNCHANGED retryVars

---------------------------------------------------------------------------
\* What the user can do in PrivateNotes.

\* submit() for a new note -> submitCreate -> applyQueue + flushOne.
SubmitCreate(l) ==
    /\ Touchable(l)
    /\ nextRev <= MaxRevs
    /\ usedIds /= NoteIds
    /\ LET n == FreshId
           q == [mem[l] EXCEPT ![n] = [rev |-> nextRev, upd |-> FALSE, exp |-> None]]
           c == [conflict[l] EXCEPT ![n] = "none"]
       IN /\ Apply(l, q)
          /\ conflict' = [conflict EXCEPT ![l] = c]
          /\ req' = [req EXCEPT ![l] = Send(l, n, q, c)]
          /\ TriggerOn(l, n, q, c)
          /\ usedIds' = usedIds \cup {n}
    /\ nextRev' = nextRev + 1
    /\ UNCHANGED <<stored, server, serverHad, status, stack, loaded, loadWait,
                   durable, discarded, crashes, foreigns>>

\* beginEdit + submit() -> submitUpdate(note, expectedUpdatedAt). The note
\* is listed from the server, and onLongPress ignores pending notes.
SubmitUpdate(l, n) ==
    /\ Touchable(l)
    /\ nextRev <= MaxRevs
    /\ server[n] /= None
    /\ mem[l][n] = NoEntry
    /\ LET q == [mem[l] EXCEPT ![n] = [rev |-> nextRev, upd |-> TRUE, exp |-> server[n]]]
           c == [conflict[l] EXCEPT ![n] = "none"]
       IN /\ Apply(l, q)
          /\ conflict' = [conflict EXCEPT ![l] = c]
          /\ req' = [req EXCEPT ![l] = Send(l, n, q, c)]
          /\ TriggerOn(l, n, q, c)
    /\ nextRev' = nextRev + 1
    /\ UNCHANGED <<stored, server, serverHad, status, stack, loaded, loadWait,
                   usedIds, durable, discarded, crashes, foreigns>>

\* "Editar versão do servidor" (changed conflicts only) -> resolveUseRemote.
ResolveUseRemote(l, n) ==
    /\ Touchable(l)
    /\ conflict[l][n] = "changed"
    /\ Apply(l, [mem[l] EXCEPT ![n] = NoEntry])
    /\ conflict' = [conflict EXCEPT ![l][n] = "none"]
    /\ discarded' = IF mem[l][n] = NoEntry THEN discarded ELSE discarded \cup {mem[l][n].rev}
    /\ UNCHANGED <<stored, server, serverHad, status, stack, loaded, loadWait, req,
                   usedIds, nextRev, durable, crashes, foreigns>>
    /\ UNCHANGED retryVars

\* "Manter como nova anotação" -> resolveKeepAsNew: same text, fresh id, create.
ResolveKeepAsNew(l, n) ==
    /\ Touchable(l)
    /\ conflict[l][n] /= "none"
    /\ mem[l][n] /= NoEntry
    /\ usedIds /= NoteIds
    /\ LET m == FreshId
           q == [[mem[l] EXCEPT ![n] = NoEntry] EXCEPT ![m] = [rev |-> mem[l][n].rev, upd |-> FALSE, exp |-> None]]
           c == [conflict[l] EXCEPT ![n] = "none"]
       IN /\ Apply(l, q)
          /\ conflict' = [conflict EXCEPT ![l] = c]
          /\ req' = [req EXCEPT ![l] = Send(l, m, q, c)]
          /\ TriggerOn(l, m, q, c)
          /\ usedIds' = usedIds \cup {m}
    /\ UNCHANGED <<stored, server, serverHad, status, stack, loaded, loadWait,
                   nextRev, durable, discarded, crashes, foreigns>>

\* "Usar minha versão" (changed) / "Restaurar minha versão" (deleted) ->
\* resolveUseLocal: same id, same text (rev), conflict cleared, then flushOne.
\* A changed conflict becomes update(expectedUpdatedAt = conflict.remote.updatedAt).
\* The model does not record which remote the conflict showed, so exp ranges
\* over every server value: a superset of what the code can send. A deleted
\* conflict becomes create. Variant "use-local-drops" removes the entry from
\* the queue and only keeps the request in flight, to show the check catches it.
ResolveUseLocal(l, n) ==
    /\ Touchable(l)
    /\ conflict[l][n] /= "none"
    /\ mem[l][n] /= NoEntry
    /\ \E x \in Revs \cup {Foreign} :
         LET e == IF conflict[l][n] = "changed"
                  THEN [rev |-> mem[l][n].rev, upd |-> TRUE, exp |-> x]
                  ELSE [rev |-> mem[l][n].rev, upd |-> FALSE, exp |-> None]
             q == [mem[l] EXCEPT ![n] = e]
             c == [conflict[l] EXCEPT ![n] = "none"]
         IN /\ Apply(l, IF Variant = "use-local-drops" THEN [mem[l] EXCEPT ![n] = NoEntry] ELSE q)
            /\ conflict' = [conflict EXCEPT ![l] = c]
            /\ req' = [req EXCEPT ![l] = Send(l, n, q, c)]
            /\ TriggerOn(l, n, q, c)
    /\ UNCHANGED <<stored, server, serverHad, status, stack, loaded, loadWait,
                   usedIds, nextRev, durable, discarded, crashes, foreigns>>

\* "Aceitar exclusão" (deleted conflicts only) -> resolveAcceptDeletion: the
\* user discards the local copy, like ResolveUseRemote does for changed ones.
ResolveAcceptDeletion(l, n) ==
    /\ Touchable(l)
    /\ conflict[l][n] = "deleted"
    /\ Apply(l, [mem[l] EXCEPT ![n] = NoEntry])
    /\ conflict' = [conflict EXCEPT ![l][n] = "none"]
    /\ discarded' = IF mem[l][n] = NoEntry THEN discarded ELSE discarded \cup {mem[l][n].rev}
    /\ UNCHANGED <<stored, server, serverHad, status, stack, loaded, loadWait, req,
                   usedIds, nextRev, durable, crashes, foreigns>>
    /\ UNCHANGED retryVars

\* flushAll from the effect after load, from onlineManager/focusManager, and
\* from retryAll ("Sincronizar novamente", top screen only, a subset of this).
\* Every mounted screen has these listeners, not only the one on top.
FlushAll(l) ==
    /\ status[l] = "mounted" /\ loaded[l]
    /\ LET r == [n \in NoteIds |->
                   IF req[l][n] = NoReq /\ conflict[l][n] = "none" /\ mem[l][n] /= NoEntry
                   THEN [entry |-> mem[l][n], phase |-> "sent"]
                   ELSE req[l][n]]
           S == {n \in NoteIds : InFlightTrigger(l, n, mem[l], conflict[l])}
       IN /\ r /= req[l] \/ ~(S \subseteq trigd[l])
          /\ req' = [req EXCEPT ![l] = r]
          /\ RecordTriggers(l, S)
    /\ UNCHANGED <<stored, chain, server, serverHad, status, stack, loaded, loadWait,
                   mem, conflict, usedIds, nextRev, durable, discarded, crashes, foreigns>>

---------------------------------------------------------------------------
\* The network and the server (packages/data/src/notes.ts).

\* create: insert; on error re-read, and matchesSavedNote counts as success.
\* update: conditional on updated_at = expectedUpdatedAt, else re-read.
Reach(l, n) ==
    /\ req[l][n].phase = "sent"
    /\ LET e      == req[l][n].entry
           cur    == server[n]
           accept == IF e.upd THEN cur = e.exp ELSE cur = None
           match  == ~e.upd /\ cur = e.rev
           phase  == IF accept \/ match THEN "ok" ELSE IF cur = None THEN "deleted" ELSE "changed"
       IN /\ server' = IF accept THEN [server EXCEPT ![n] = e.rev] ELSE server
          /\ serverHad' = IF accept THEN serverHad \cup {e.rev} ELSE serverHad
          /\ req' = [req EXCEPT ![l][n].phase = phase]
    /\ UNCHANGED <<stored, chain, status, stack, loaded, loadWait, mem, conflict,
                   usedIds, nextRev, durable, discarded, crashes, foreigns>>
    /\ UNCHANGED retryVars

\* The rest of flushOne runs when the await settles, also on an unmounted
\* screen: its closure still holds queueRef and applyQueue for the key.
Alive(l) == status[l] \in {"mounted", "unmounted"}

\* Success: applyQueue(dequeueNote(queueRef.current, noteId)).
RespondOk(l, n) ==
    /\ Alive(l) /\ req[l][n].phase = "ok"
    /\ LET q == [mem[l] EXCEPT ![n] = NoEntry]
           c == [conflict[l] EXCEPT ![n] = "none"]
       IN /\ Apply(l, q)
          /\ conflict' = [conflict EXCEPT ![l] = c]
          /\ Settle(l, n, q, c)
    /\ UNCHANGED <<stored, server, serverHad, status, stack, loaded, loadWait,
                   usedIds, nextRev, durable, discarded, crashes, foreigns>>

\* NotesConflictError: markConflict, then applyQueue(markAttempt(...)) keeps
\* the entry (generation and lastError are not modeled).
RespondConflict(l, n) ==
    /\ Alive(l) /\ req[l][n].phase \in {"changed", "deleted"}
    /\ LET q == IF Variant = "drop-on-conflict" THEN [mem[l] EXCEPT ![n] = NoEntry] ELSE mem[l]
           c == [conflict[l] EXCEPT ![n] = req[l][n].phase]
       IN /\ Apply(l, q)
          /\ conflict' = [conflict EXCEPT ![l] = c]
          /\ Settle(l, n, q, c)
    /\ UNCHANGED <<stored, server, serverHad, status, stack, loaded, loadWait,
                   usedIds, nextRev, durable, discarded, crashes, foreigns>>

\* Any other error: offline before the server, or the response was lost
\* after the server applied it. applyQueue(markAttempt(...)).
RespondFail(l, n) ==
    /\ Alive(l) /\ req[l][n].phase /= "none"
    /\ Apply(l, mem[l])
    /\ Settle(l, n, mem[l], conflict[l])
    /\ UNCHANGED <<stored, server, serverHad, status, stack, loaded, loadWait,
                   conflict, usedIds, nextRev, durable, discarded, crashes, foreigns>>

\* Another device of the same user edits or deletes the row.
ForeignEdit(n) ==
    /\ foreigns < MaxForeign /\ server[n] \notin {None, Foreign}
    /\ server' = [server EXCEPT ![n] = Foreign]
    /\ foreigns' = foreigns + 1
    /\ UNCHANGED <<stored, chain, serverHad, status, stack, loaded, loadWait, mem,
                   conflict, req, usedIds, nextRev, durable, discarded, crashes>>
    /\ UNCHANGED retryVars

ForeignDelete(n) ==
    /\ foreigns < MaxForeign /\ server[n] /= None
    /\ server' = [server EXCEPT ![n] = None]
    /\ foreigns' = foreigns + 1
    /\ UNCHANGED <<stored, chain, serverHad, status, stack, loaded, loadWait, mem,
                   conflict, req, usedIds, nextRev, durable, discarded, crashes>>
    /\ UNCHANGED retryVars

---------------------------------------------------------------------------
Next ==
    \/ \E l \in Lifetimes :
         Mount(l) \/ LoadRead(l) \/ Unmount(l) \/ SubmitCreate(l) \/ FlushAll(l)
    \/ \E l \in Lifetimes, n \in NoteIds :
         \/ SubmitUpdate(l, n) \/ ResolveUseRemote(l, n) \/ ResolveKeepAsNew(l, n)
         \/ ResolveUseLocal(l, n) \/ ResolveAcceptDeletion(l, n)
         \/ Reach(l, n) \/ RespondOk(l, n) \/ RespondConflict(l, n) \/ RespondFail(l, n)
    \/ \E n \in NoteIds : ForeignEdit(n) \/ ForeignDelete(n)
    \/ Land
    \/ Crash

Spec == Init /\ [][Next]_vars

ChainBound == Len(chain) <= MaxChain
LifetimeSymmetry == Permutations(Lifetimes)
=============================================================================
