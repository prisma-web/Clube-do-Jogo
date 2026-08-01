'use client';

import { useState } from 'react';
import Link from 'next/link';
import * as Tabs from '@radix-ui/react-tabs';
import { ArrowUpRight, ThumbsDown, ThumbsUp } from 'lucide-react';
import type { VoteChoice, VoteParticipant } from '@/lib/types';
import { Dialog, DialogContent } from './ui/dialog';
import { Avatar } from './ui/avatar';
import { voteReasonLabel } from './vote-reason-dialog';

const choices = [
  { value: 'would_not_play', label: 'Não', Icon: ThumbsDown },
  { value: 'would_play', label: 'Jogaria', Icon: ThumbsUp },
] as const;

function OtherReason({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const long = text.length > 72;
  return <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">{long && !expanded ? `${text.slice(0, 72).trim()}…` : text}{long && <button type="button" onClick={event => { event.preventDefault(); event.stopPropagation(); setExpanded(value => !value); }} className="ml-1 font-extrabold text-violet-300">{expanded ? 'Ver menos' : 'Ver mais'}</button>}</p>;
}

function People({ people, showReason = false }: { people: VoteParticipant[]; showReason?: boolean }) {
  if (!people.length) return <div className="grid min-h-44 place-items-center text-sm text-zinc-500">Ninguém escolheu esta opção.</div>;
  return <div className="participants-people-list grid max-h-[58dvh] gap-2 overflow-y-auto p-3">{people.map(person => (
    <Link key={person.id} href={`/perfil/${person.id}`} className="participant-person group flex min-h-16 items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.025] px-3 py-2.5 transition">
      <Avatar src={person.avatar_url} name={person.name} className="participant-person-avatar size-11" />
      <span className="min-w-0 flex-1"><strong className="participant-person-name block truncate text-sm font-extrabold">{person.name || 'Membro'}</strong>{showReason && <><span className="mt-0.5 block text-[10px] font-bold text-red-300/80">{voteReasonLabel(person.reason)}</span>{person.reason === 'other' && person.reasonText && <OtherReason text={person.reasonText} />}</>}</span>
      <span className="participant-person-action grid size-8 shrink-0 place-items-center rounded-full border border-white/[0.07]"><ArrowUpRight className="size-3.5" /></span>
    </Link>
  ))}</div>;
}

export function PreferenceParticipantsDialog({ profiles, children, initialTab = 'would_play' }: {
  profiles: Record<VoteChoice, VoteParticipant[]>;
  children: (openAt: (choice: VoteChoice) => void) => React.ReactNode;
  initialTab?: VoteChoice;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<VoteChoice>(initialTab);
  const openAt = (choice: VoteChoice) => { setActive(choice); setOpen(true); };
  return <>
    {children(openAt)}
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent title="Escolhas do clube">
        <Tabs.Root value={active} onValueChange={value => setActive(value as VoteChoice)}>
          <Tabs.List className="participants-tabs app-tabs mx-4 mt-4 grid grid-cols-2 rounded-xl p-1">
            {choices.map(({ value, label, Icon }) => <Tabs.Trigger key={value} value={value} className="flex min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 py-2.5 text-[10px] font-bold text-zinc-500 outline-none data-[state=active]:bg-white/8 data-[state=active]:text-violet-300"><Icon className="size-3.5" /><span>{label} · {profiles[value].length}</span></Tabs.Trigger>)}
          </Tabs.List>
          {choices.map(choice => <Tabs.Content key={choice.value} value={choice.value} className="outline-none data-[state=active]:animate-tab-in"><People people={profiles[choice.value]} showReason={choice.value === 'would_not_play'} /></Tabs.Content>)}
        </Tabs.Root>
      </DialogContent>
    </Dialog>
  </>;
}
