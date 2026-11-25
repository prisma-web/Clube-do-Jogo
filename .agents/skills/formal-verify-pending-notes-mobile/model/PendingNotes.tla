---------------------------- MODULE PendingNotes ----------------------------
EXTENDS Integers, Sequences, FiniteSets, TLC

CONSTANTS
    Lifetimes,
    MaxMounted,
    QuiescentUnmount,
    MaxIds, MaxRevs, MaxChain, MaxCrashes, MaxForeign,
    Variant

ASSUME Variant \in {"none", "drop-on-conflict", "no-load-wait", "unserialized-writes", "use-local-drops",
                    "no-rerun"}

NoteIds == 1..MaxIds
Revs    == 1..MaxRevs
Foreign == 0
None    == -1
NoEntry == [rev |-> None, upd |-> FALSE, exp |-> None]
NoReq   == [entry |-> NoEntry, phase |-> "none"]
EmptyQ  == [n \in NoteIds |-> NoEntry]

VARIABLES
    stored,
    chain,
    server,
    serverHad,
    status,
    stack,
    loaded,
    loadWait,
    mem,
    conflict,
    req,
    rerun,
    trigd,
    missed,
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

NoLostNote ==
    \A r \in durable : r \in serverHad \/ r \in RevsIn(stored) \/ r \in discarded

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

Touchable(l) == stack /= <<>> /\ stack[Len(stack)] = l /\ loaded[l]

FreshId == CHOOSE n \in NoteIds \ usedIds : \A m \in NoteIds \ usedIds : n <= m

Apply(l, q) ==
    /\ mem' = [mem EXCEPT ![l] = q]
    /\ chain' = Append(chain, q)

Send(l, n, q, c) ==
    IF req[l][n] = NoReq /\ c[n] = "none" /\ q[n] /= NoEntry
    THEN [req[l] EXCEPT ![n] = [entry |-> q[n], phase |-> "sent"]]
    ELSE req[l]

InFlightTrigger(l, n, q, c) == req[l][n] /= NoReq /\ c[n] = "none" /\ q[n] /= NoEntry

RecordTriggers(l, S) ==
    /\ rerun' = IF Variant = "no-rerun" THEN rerun ELSE [rerun EXCEPT ![l] = @ \cup S]
    /\ trigd' = [trigd EXCEPT ![l] = @ \cup S]
    /\ UNCHANGED missed

TriggerOn(l, n, q, c) == RecordTriggers(l, IF InFlightTrigger(l, n, q, c) THEN {n} ELSE {})

Settle(l, n, q, c) ==
    LET r0    == [req[l] EXCEPT ![n] = NoReq]
        again == n \in rerun[l] /\ c[n] = "none" /\ q[n] /= NoEntry
        lost  == n \in trigd[l] /\ c[n] = "none" /\ q[n] /= NoEntry /\ ~again
    IN /\ req' = [req EXCEPT ![l] = IF again THEN [r0 EXCEPT ![n] = [entry |-> q[n], phase |-> "sent"]] ELSE r0]
       /\ rerun' = [rerun EXCEPT ![l] = @ \ {n}]
       /\ trigd' = [trigd EXCEPT ![l] = @ \ {n}]
       /\ missed' = IF lost THEN missed \cup {n} ELSE missed

---------------------------------------------------------------------------

Mount(l) ==
    /\ status[l] = "idle"
    /\ Len(stack) < MaxMounted
    /\ status' = [status EXCEPT ![l] = "mounted"]
    /\ stack' = Append(stack, l)
    /\ loadWait' = [loadWait EXCEPT ![l] = IF Variant = "no-load-wait" THEN 0 ELSE Len(chain)]
    /\ UNCHANGED <<stored, chain, server, serverHad, loaded, mem, conflict, req,
                   usedIds, nextRev, durable, discarded, crashes, foreigns>>
    /\ UNCHANGED retryVars

LoadRead(l) ==
    /\ status[l] = "mounted" /\ ~loaded[l] /\ loadWait[l] = 0
    /\ mem' = [mem EXCEPT ![l] = stored]
    /\ loaded' = [loaded EXCEPT ![l] = TRUE]
    /\ UNCHANGED <<stored, chain, server, serverHad, status, stack, loadWait,
                   conflict, req, usedIds, nextRev, durable, discarded, crashes, foreigns>>
    /\ UNCHANGED retryVars

Unmount(l) ==
    /\ stack /= <<>> /\ stack[Len(stack)] = l
    /\ QuiescentUnmount => \A n \in NoteIds : req[l][n] = NoReq
    /\ status' = [status EXCEPT ![l] = "unmounted"]
    /\ stack' = SubSeq(stack, 1, Len(stack) - 1)
    /\ UNCHANGED <<stored, chain, server, serverHad, loaded, loadWait, mem, conflict,
                   req, usedIds, nextRev, durable, discarded, crashes, foreigns>>
    /\ UNCHANGED retryVars

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

ResolveUseRemote(l, n) ==
    /\ Touchable(l)
    /\ conflict[l][n] = "changed"
    /\ Apply(l, [mem[l] EXCEPT ![n] = NoEntry])
    /\ conflict' = [conflict EXCEPT ![l][n] = "none"]
    /\ discarded' = IF mem[l][n] = NoEntry THEN discarded ELSE discarded \cup {mem[l][n].rev}
    /\ UNCHANGED <<stored, server, serverHad, status, stack, loaded, loadWait, req,
                   usedIds, nextRev, durable, crashes, foreigns>>
    /\ UNCHANGED retryVars

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

ResolveAcceptDeletion(l, n) ==
    /\ Touchable(l)
    /\ conflict[l][n] = "deleted"
    /\ Apply(l, [mem[l] EXCEPT ![n] = NoEntry])
    /\ conflict' = [conflict EXCEPT ![l][n] = "none"]
    /\ discarded' = IF mem[l][n] = NoEntry THEN discarded ELSE discarded \cup {mem[l][n].rev}
    /\ UNCHANGED <<stored, server, serverHad, status, stack, loaded, loadWait, req,
                   usedIds, nextRev, durable, crashes, foreigns>>
    /\ UNCHANGED retryVars

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

Alive(l) == status[l] \in {"mounted", "unmounted"}

RespondOk(l, n) ==
    /\ Alive(l) /\ req[l][n].phase = "ok"
    /\ LET q == [mem[l] EXCEPT ![n] = NoEntry]
           c == [conflict[l] EXCEPT ![n] = "none"]
       IN /\ Apply(l, q)
          /\ conflict' = [conflict EXCEPT ![l] = c]
          /\ Settle(l, n, q, c)
    /\ UNCHANGED <<stored, server, serverHad, status, stack, loaded, loadWait,
                   usedIds, nextRev, durable, discarded, crashes, foreigns>>

RespondConflict(l, n) ==
    /\ Alive(l) /\ req[l][n].phase \in {"changed", "deleted"}
    /\ LET q == IF Variant = "drop-on-conflict" THEN [mem[l] EXCEPT ![n] = NoEntry] ELSE mem[l]
           c == [conflict[l] EXCEPT ![n] = req[l][n].phase]
       IN /\ Apply(l, q)
          /\ conflict' = [conflict EXCEPT ![l] = c]
          /\ Settle(l, n, q, c)
    /\ UNCHANGED <<stored, server, serverHad, status, stack, loaded, loadWait,
                   usedIds, nextRev, durable, discarded, crashes, foreigns>>

RespondFail(l, n) ==
    /\ Alive(l) /\ req[l][n].phase /= "none"
    /\ Apply(l, mem[l])
    /\ Settle(l, n, mem[l], conflict[l])
    /\ UNCHANGED <<stored, server, serverHad, status, stack, loaded, loadWait,
                   conflict, usedIds, nextRev, durable, discarded, crashes, foreigns>>

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
