------------------------------ MODULE ViewSound ------------------------------
EXTENDS PendingNotes

Perm(f, p) == [l \in Lifetimes |-> f[p[l]]]
At(p, s) == IF s = Shared THEN Shared ELSE p[s]
PermS(f, p) == [s \in Slots |-> f[At(p, s)]]
Ch(S, D) == [i \in D |-> i \in S]
ViewAt(p) ==
    LET v == ReducedView
    IN <<v[1], v[2], v[3], Perm(v[4], p), [k \in 1..Len(v[5]) |-> CHOOSE l \in Lifetimes : p[l] = v[5][k]],
         Perm(v[6], p), Perm(v[7], p), PermS(v[8], p), PermS(v[9], p), Perm(v[10], p),
         [s \in Slots |-> Ch(v[11][At(p, s)], NoteIds)], [s \in Slots |-> Ch(v[12][At(p, s)], NoteIds)],
         Ch(v[13], NoteIds), Ch(v[14], NoteIds), v[15], Ch(v[16], Revs), Ch(v[17], Revs), v[18], v[19], v[20]>>
PrintOrbit == ChainBound => PrintT({ToString(ViewAt(p)) : p \in Permutations(Lifetimes)})
=============================================================================
