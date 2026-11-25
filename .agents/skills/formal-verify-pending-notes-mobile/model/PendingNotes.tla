---------------------------- MODULE PendingNotes ----------------------------
EXTENDS Integers, Sequences, FiniteSets, TLC

CONSTANTS
    Lifetimes,
    MaxMounted,
    QuiescentUnmount,
    MaxIds, MaxRevs, MaxChain, MaxCrashes, MaxForeign,
    Variant

ASSUME Variant \in {"none", "drop-on-conflict", "reload-on-mount", "unserialized-writes", "use-local-drops",
                    "no-rerun", "per-instance"}

NoteIds == 1..MaxIds
Revs    == 1..MaxRevs
Foreign == 0
None    == -1
NoEntry == [rev |-> None, upd |-> FALSE, exp |-> None]
NoReq   == [entry |-> NoEntry, phase |-> "none"]
EmptyQ  == [n \in NoteIds |-> NoEntry]
NoConflict == [n \in NoteIds |-> "none"]

Shared  == "shared"
Slots   == Lifetimes \cup {Shared}
Slot(l) == IF Variant = "per-instance" THEN l ELSE Shared

VARIABLES
    stored,
    chain,
    server,
    serverHad,
    status,
    stack,
    loaded,
    loadWait,
    storeLoaded,
    mem,
    conflict,
    req,
    rerun,
    trigd,
    missed,
    usedIds, nextRev, durable, discarded, crashes, foreigns

vars == <<stored, chain, server, serverHad, status, stack, loaded, loadWait, storeLoaded,
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
    /\ storeLoaded \in BOOLEAN
    /\ mem \in [Slots -> Queue]
    /\ conflict \in [Slots -> [NoteIds -> {"none", "changed", "deleted"}]]
    /\ \A l \in Lifetimes, n \in NoteIds : req[l][n].phase \in Phase
    /\ rerun \in [Slots -> SUBSET NoteIds]
    /\ trigd \in [Slots -> SUBSET NoteIds]
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
    /\ storeLoaded = FALSE
    /\ mem = [s \in Slots |-> EmptyQ]
    /\ conflict = [s \in Slots |-> NoConflict]
    /\ req = [l \in Lifetimes |-> [n \in NoteIds |-> NoReq]]
    /\ rerun = [s \in Slots |-> {}]
    /\ trigd = [s \in Slots |-> {}]
    /\ missed = {}
    /\ usedIds = {}
    /\ nextRev = 1
    /\ durable = {}
    /\ discarded = {}
    /\ crashes = 0
    /\ foreigns = 0

Touchable(l) == stack /= <<>> /\ stack[Len(stack)] = l /\ loaded[l]

FreshId == CHOOSE n \in NoteIds \ usedIds : \A m \in NoteIds \ usedIds : n <= m

Alive(l) == status[l] \in {"mounted", "unmounted"}

Apply(l, q) ==
    /\ mem' = [mem EXCEPT ![Slot(l)] = q]
    /\ chain' = Append(chain, q)

InFlight(s, n) == \E l \in Lifetimes : Slot(l) = s /\ Alive(l) /\ req[l][n] /= NoReq

Send(l, n, q, c) ==
    IF ~InFlight(Slot(l), n) /\ c[n] = "none" /\ q[n] /= NoEntry
    THEN [req[l] EXCEPT ![n] = [entry |-> q[n], phase |-> "sent"]]
    ELSE req[l]

InFlightTrigger(l, n, q, c) == InFlight(Slot(l), n) /\ c[n] = "none" /\ q[n] /= NoEntry

RecordTriggers(l, S) ==
    /\ rerun' = IF Variant = "no-rerun" THEN rerun ELSE [rerun EXCEPT ![Slot(l)] = @ \cup S]
    /\ trigd' = [trigd EXCEPT ![Slot(l)] = @ \cup S]
    /\ UNCHANGED missed

TriggerOn(l, n, q, c) == RecordTriggers(l, IF InFlightTrigger(l, n, q, c) THEN {n} ELSE {})

Settle(l, n, q, c) ==
    LET s     == Slot(l)
        r0    == [req[l] EXCEPT ![n] = NoReq]
        again == n \in rerun[s] /\ c[n] = "none" /\ q[n] /= NoEntry
        lost  == n \in trigd[s] /\ c[n] = "none" /\ q[n] /= NoEntry /\ ~again
    IN /\ req' = [req EXCEPT ![l] = IF again THEN [r0 EXCEPT ![n] = [entry |-> q[n], phase |-> "sent"]] ELSE r0]
       /\ rerun' = [rerun EXCEPT ![s] = @ \ {n}]
       /\ trigd' = [trigd EXCEPT ![s] = @ \ {n}]
       /\ missed' = IF lost THEN missed \cup {n} ELSE missed

---------------------------------------------------------------------------

Mount(l) ==
    /\ status[l] = "idle"
    /\ Len(stack) < MaxMounted
    /\ status' = [status EXCEPT ![l] = "mounted"]
    /\ stack' = Append(stack, l)
    /\ loadWait' = [loadWait EXCEPT ![l] = IF Variant = "per-instance" THEN Len(chain) ELSE 0]
    /\ UNCHANGED <<stored, chain, server, serverHad, loaded, storeLoaded, mem, conflict, req,
                   usedIds, nextRev, durable, discarded, crashes, foreigns>>
    /\ UNCHANGED retryVars

LoadRead(l) ==
    /\ status[l] = "mounted" /\ ~loaded[l] /\ loadWait[l] = 0
    /\ mem' = IF storeLoaded /\ Variant \notin {"per-instance", "reload-on-mount"}
              THEN mem
              ELSE [mem EXCEPT ![Slot(l)] = stored]
    /\ storeLoaded' = TRUE
    /\ loaded' = [loaded EXCEPT ![l] = TRUE]
    /\ UNCHANGED <<stored, chain, server, serverHad, status, stack, loadWait,
                   conflict, req, usedIds, nextRev, durable, discarded, crashes, foreigns>>
    /\ UNCHANGED retryVars

Unmount(l) ==
    /\ stack /= <<>> /\ stack[Len(stack)] = l
    /\ QuiescentUnmount => \A n \in NoteIds : req[l][n] = NoReq
    /\ status' = [status EXCEPT ![l] = "unmounted"]
    /\ stack' = SubSeq(stack, 1, Len(stack) - 1)
    /\ UNCHANGED <<stored, chain, server, serverHad, loaded, storeLoaded, loadWait, mem, conflict,
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
    /\ rerun' = [s \in Slots |-> {}]
    /\ trigd' = [s \in Slots |-> {}]
    /\ UNCHANGED missed
    /\ storeLoaded' = FALSE
    /\ mem' = [mem EXCEPT ![Shared] = EmptyQ]
    /\ conflict' = [conflict EXCEPT ![Shared] = NoConflict]
    /\ UNCHANGED <<stored, server, serverHad, loaded, req,
                   usedIds, nextRev, durable, discarded, foreigns>>

Land ==
    /\ chain /= <<>>
    /\ \E k \in 1..Len(chain) :
         /\ k = 1 \/ Variant = "unserialized-writes"
         /\ stored' = chain[k]
         /\ chain' = [j \in 1..(Len(chain) - 1) |-> IF j < k THEN chain[j] ELSE chain[j + 1]]
         /\ durable' = durable \cup RevsIn(chain[k])
    /\ loadWait' = [l \in Lifetimes |-> IF loadWait[l] > 0 THEN loadWait[l] - 1 ELSE 0]
    /\ UNCHANGED <<server, serverHad, status, stack, loaded, storeLoaded, mem, conflict, req,
                   usedIds, nextRev, discarded, crashes, foreigns>>
    /\ UNCHANGED retryVars

---------------------------------------------------------------------------

SubmitCreate(l) ==
    /\ Touchable(l)
    /\ nextRev <= MaxRevs
    /\ usedIds /= NoteIds
    /\ LET n == FreshId
           q == [mem[Slot(l)] EXCEPT ![n] = [rev |-> nextRev, upd |-> FALSE, exp |-> None]]
           c == [conflict[Slot(l)] EXCEPT ![n] = "none"]
       IN /\ Apply(l, q)
          /\ conflict' = [conflict EXCEPT ![Slot(l)] = c]
          /\ req' = [req EXCEPT ![l] = Send(l, n, q, c)]
          /\ TriggerOn(l, n, q, c)
          /\ usedIds' = usedIds \cup {n}
    /\ nextRev' = nextRev + 1
    /\ UNCHANGED <<stored, server, serverHad, status, stack, loaded, storeLoaded, loadWait,
                   durable, discarded, crashes, foreigns>>

SubmitUpdate(l, n) ==
    /\ Touchable(l)
    /\ nextRev <= MaxRevs
    /\ server[n] /= None
    /\ mem[Slot(l)][n] = NoEntry
    /\ LET q == [mem[Slot(l)] EXCEPT ![n] = [rev |-> nextRev, upd |-> TRUE, exp |-> server[n]]]
           c == [conflict[Slot(l)] EXCEPT ![n] = "none"]
       IN /\ Apply(l, q)
          /\ conflict' = [conflict EXCEPT ![Slot(l)] = c]
          /\ req' = [req EXCEPT ![l] = Send(l, n, q, c)]
          /\ TriggerOn(l, n, q, c)
    /\ nextRev' = nextRev + 1
    /\ UNCHANGED <<stored, server, serverHad, status, stack, loaded, storeLoaded, loadWait,
                   usedIds, durable, discarded, crashes, foreigns>>

ResolveUseRemote(l, n) ==
    /\ Touchable(l)
    /\ conflict[Slot(l)][n] = "changed"
    /\ Apply(l, [mem[Slot(l)] EXCEPT ![n] = NoEntry])
    /\ conflict' = [conflict EXCEPT ![Slot(l)][n] = "none"]
    /\ discarded' = IF mem[Slot(l)][n] = NoEntry THEN discarded ELSE discarded \cup {mem[Slot(l)][n].rev}
    /\ UNCHANGED <<stored, server, serverHad, status, stack, loaded, storeLoaded, loadWait, req,
                   usedIds, nextRev, durable, crashes, foreigns>>
    /\ UNCHANGED retryVars

ResolveKeepAsNew(l, n) ==
    /\ Touchable(l)
    /\ conflict[Slot(l)][n] /= "none"
    /\ mem[Slot(l)][n] /= NoEntry
    /\ usedIds /= NoteIds
    /\ LET m == FreshId
           q == [[mem[Slot(l)] EXCEPT ![n] = NoEntry] EXCEPT ![m] = [rev |-> mem[Slot(l)][n].rev, upd |-> FALSE, exp |-> None]]
           c == [conflict[Slot(l)] EXCEPT ![n] = "none"]
       IN /\ Apply(l, q)
          /\ conflict' = [conflict EXCEPT ![Slot(l)] = c]
          /\ req' = [req EXCEPT ![l] = Send(l, m, q, c)]
          /\ TriggerOn(l, m, q, c)
          /\ usedIds' = usedIds \cup {m}
    /\ UNCHANGED <<stored, server, serverHad, status, stack, loaded, storeLoaded, loadWait,
                   nextRev, durable, discarded, crashes, foreigns>>

ResolveUseLocal(l, n) ==
    /\ Touchable(l)
    /\ conflict[Slot(l)][n] /= "none"
    /\ mem[Slot(l)][n] /= NoEntry
    /\ \E x \in Revs \cup {Foreign} :
         LET e == IF conflict[Slot(l)][n] = "changed"
                  THEN [rev |-> mem[Slot(l)][n].rev, upd |-> TRUE, exp |-> x]
                  ELSE [rev |-> mem[Slot(l)][n].rev, upd |-> FALSE, exp |-> None]
             q == [mem[Slot(l)] EXCEPT ![n] = e]
             c == [conflict[Slot(l)] EXCEPT ![n] = "none"]
         IN /\ Apply(l, IF Variant = "use-local-drops" THEN [mem[Slot(l)] EXCEPT ![n] = NoEntry] ELSE q)
            /\ conflict' = [conflict EXCEPT ![Slot(l)] = c]
            /\ req' = [req EXCEPT ![l] = Send(l, n, q, c)]
            /\ TriggerOn(l, n, q, c)
    /\ UNCHANGED <<stored, server, serverHad, status, stack, loaded, storeLoaded, loadWait,
                   usedIds, nextRev, durable, discarded, crashes, foreigns>>

ResolveAcceptDeletion(l, n) ==
    /\ Touchable(l)
    /\ conflict[Slot(l)][n] = "deleted"
    /\ Apply(l, [mem[Slot(l)] EXCEPT ![n] = NoEntry])
    /\ conflict' = [conflict EXCEPT ![Slot(l)][n] = "none"]
    /\ discarded' = IF mem[Slot(l)][n] = NoEntry THEN discarded ELSE discarded \cup {mem[Slot(l)][n].rev}
    /\ UNCHANGED <<stored, server, serverHad, status, stack, loaded, storeLoaded, loadWait, req,
                   usedIds, nextRev, durable, crashes, foreigns>>
    /\ UNCHANGED retryVars

FlushAll(l) ==
    /\ status[l] = "mounted" /\ loaded[l]
    /\ LET r == [n \in NoteIds |->
                   IF ~InFlight(Slot(l), n) /\ conflict[Slot(l)][n] = "none" /\ mem[Slot(l)][n] /= NoEntry
                   THEN [entry |-> mem[Slot(l)][n], phase |-> "sent"]
                   ELSE req[l][n]]
           S == {n \in NoteIds : InFlightTrigger(l, n, mem[Slot(l)], conflict[Slot(l)])}
       IN /\ r /= req[l] \/ ~(S \subseteq trigd[Slot(l)])
          /\ req' = [req EXCEPT ![l] = r]
          /\ RecordTriggers(l, S)
    /\ UNCHANGED <<stored, chain, server, serverHad, status, stack, loaded, storeLoaded, loadWait,
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
    /\ UNCHANGED <<stored, chain, status, stack, loaded, storeLoaded, loadWait, mem, conflict,
                   usedIds, nextRev, durable, discarded, crashes, foreigns>>
    /\ UNCHANGED retryVars

RespondOk(l, n) ==
    /\ Alive(l) /\ req[l][n].phase = "ok"
    /\ LET q == [mem[Slot(l)] EXCEPT ![n] = NoEntry]
           c == [conflict[Slot(l)] EXCEPT ![n] = "none"]
       IN /\ Apply(l, q)
          /\ conflict' = [conflict EXCEPT ![Slot(l)] = c]
          /\ Settle(l, n, q, c)
    /\ UNCHANGED <<stored, server, serverHad, status, stack, loaded, storeLoaded, loadWait,
                   usedIds, nextRev, durable, discarded, crashes, foreigns>>

RespondConflict(l, n) ==
    /\ Alive(l) /\ req[l][n].phase \in {"changed", "deleted"}
    /\ LET q == IF Variant = "drop-on-conflict" THEN [mem[Slot(l)] EXCEPT ![n] = NoEntry] ELSE mem[Slot(l)]
           c == [conflict[Slot(l)] EXCEPT ![n] = req[l][n].phase]
       IN /\ Apply(l, q)
          /\ conflict' = [conflict EXCEPT ![Slot(l)] = c]
          /\ Settle(l, n, q, c)
    /\ UNCHANGED <<stored, server, serverHad, status, stack, loaded, storeLoaded, loadWait,
                   usedIds, nextRev, durable, discarded, crashes, foreigns>>

RespondFail(l, n) ==
    /\ Alive(l) /\ req[l][n].phase /= "none"
    /\ Apply(l, mem[Slot(l)])
    /\ Settle(l, n, mem[Slot(l)], conflict[Slot(l)])
    /\ UNCHANGED <<stored, server, serverHad, status, stack, loaded, storeLoaded, loadWait,
                   conflict, usedIds, nextRev, durable, discarded, crashes, foreigns>>

ForeignEdit(n) ==
    /\ foreigns < MaxForeign /\ server[n] \notin {None, Foreign}
    /\ server' = [server EXCEPT ![n] = Foreign]
    /\ foreigns' = foreigns + 1
    /\ UNCHANGED <<stored, chain, serverHad, status, stack, loaded, storeLoaded, loadWait, mem,
                   conflict, req, usedIds, nextRev, durable, discarded, crashes>>
    /\ UNCHANGED retryVars

ForeignDelete(n) ==
    /\ foreigns < MaxForeign /\ server[n] /= None
    /\ server' = [server EXCEPT ![n] = None]
    /\ foreigns' = foreigns + 1
    /\ UNCHANGED <<stored, chain, serverHad, status, stack, loaded, storeLoaded, loadWait, mem,
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

Inert(l) == status[l] = "dead" \/ (status[l] = "unmounted" /\ \A n \in NoteIds : req[l][n] = NoReq)
Users(s) == {l \in Lifetimes : Slot(l) = s /\ (status[l] = "idle" \/ ~Inert(l))}
LiveSlots == {s \in Slots : Users(s) /= {}}
Wholly(s) == \E l \in Users(s) : status[l] \in {"idle", "mounted"}
Sent(l, n) == req[l][n].phase = "sent"
Futures(n, LS) ==
    {server[n]}
    \cup (IF foreigns < MaxForeign THEN {Foreign} ELSE {})
    \cup {r \in Revs : r >= nextRev}
    \cup {stored[n].rev}
    \cup {chain[k][n].rev : k \in 1..Len(chain)}
    \cup {mem[s][n].rev : s \in LS}
    \cup {req[l][n].entry.rev : l \in {m \in Lifetimes : Sent(m, n)}}
Stale == -2
ViewQ(q, F) == [n \in NoteIds |-> IF q[n].upd /\ q[n].exp \notin F[n] THEN [q[n] EXCEPT !.exp = Stale] ELSE q[n]]
ViewReq(l, F) ==
    [n \in NoteIds |->
       IF Sent(l, n) THEN [entry |-> ViewQ([m \in NoteIds |-> req[l][m].entry], F)[n], phase |-> "sent"]
       ELSE IF status[l] = "dead" \/ req[l][n] = NoReq THEN NoReq
       ELSE [entry |-> NoEntry, phase |-> req[l][n].phase]]
ViewConflict(s, LS) ==
    IF s \notin LS THEN NoConflict
    ELSE IF Wholly(s) THEN conflict[s]
    ELSE [n \in NoteIds |-> IF \A l \in Users(s) : req[l][n] = NoReq THEN "none" ELSE conflict[s][n]]
Safe == serverHad \cup discarded
LiveRevs(LS) == RevsIn(stored) \cup UNION {RevsIn(chain[k]) : k \in 1..Len(chain)} \cup UNION {RevsIn(mem[s]) : s \in LS}
ReducedView ==
    LET LS == LiveSlots
        F  == [n \in NoteIds |-> Futures(n, LS)]
    IN <<ViewQ(stored, F), [k \in 1..Len(chain) |-> ViewQ(chain[k], F)], server, status, stack,
         [l \in Lifetimes |-> status[l] = "mounted" /\ loaded[l]],
         [l \in Lifetimes |-> IF status[l] = "mounted" /\ ~loaded[l] THEN loadWait[l] ELSE 0],
         [s \in Slots |-> IF s \in LS THEN ViewQ(mem[s], F) ELSE EmptyQ],
         [s \in Slots |-> ViewConflict(s, LS)],
         [l \in Lifetimes |-> ViewReq(l, F)],
         [s \in Slots |-> IF s \in LS THEN rerun[s] ELSE {}],
         [s \in Slots |-> IF s \in LS THEN trigd[s] ELSE {}],
         missed, usedIds, nextRev, durable \ Safe, Safe \cap LiveRevs(LS), crashes, foreigns,
         storeLoaded /\ \E l \in Lifetimes : status[l] = "idle" \/ (status[l] = "mounted" /\ ~loaded[l])>>
=============================================================================
