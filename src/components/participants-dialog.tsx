'use client';

import Link from 'next/link';
import * as Tabs from '@radix-ui/react-tabs';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import { ArrowUpRight, CheckCircle2, ThumbsUp } from 'lucide-react';
import type { Profile } from '@/lib/types';
import { Dialog, DialogContent, DialogTrigger } from './ui/dialog';
import { Avatar } from './ui/avatar';
import { formatFinishedCount } from '@/lib/utils';
import { useUrlDialog } from '@/hooks/use-url-state';

function PeopleList({ people, empty }: { people: Profile[]; empty: string }) {
  const [parent] = useAutoAnimate<HTMLDivElement>({ duration: 150, easing: 'cubic-bezier(.22, 1, .36, 1)' });
  if (!people.length) return <div className="participants-empty grid min-h-48 place-items-center px-6 text-center text-sm text-zinc-500">{empty}</div>;
  return (
    <div ref={parent} className="participants-people-list grid max-h-[60dvh] gap-2 overflow-y-auto p-3">
      {people.map(person => (
        <Link key={person.id} href={`/perfil/${person.id}`} className="participant-person group flex min-h-16 items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.025] px-3 py-2.5 transition">
          <Avatar src={person.avatar_url} name={person.name} className="participant-person-avatar size-11" />
          <div className="min-w-0 flex-1 leading-tight">
            <div className="participant-person-name truncate text-sm font-extrabold text-zinc-100">{person.name || 'Membro'}</div>
            <div className="participant-person-copy mt-1 text-[11px] font-medium text-zinc-500">Perfil, backlog e finalizados</div>
          </div>
          <span className="participant-person-action grid size-8 shrink-0 place-items-center rounded-full border border-white/[0.07] bg-black/15 text-zinc-500 transition group-hover:text-zinc-200" aria-hidden="true">
            <ArrowUpRight className="size-3.5" />
          </span>
        </Link>
      ))}
    </div>
  );
}

export function ParticipantsDialog({ voters, completed, children, initialTab = 'votes', dialogId }: {
  voters: Profile[];
  completed: Profile[];
  children: React.ReactNode;
  initialTab?: 'votes' | 'completed';
  dialogId: string;
}) {
  const dialog = useUrlDialog('participants', { item: dialogId });
  const requestedTab = dialog.getParam('modalTab');
  const activeTab = requestedTab === 'votes' || requestedTab === 'completed' ? requestedTab : initialTab;
  return (
    <Dialog open={dialog.open} onOpenChange={open => open ? dialog.show({ modalTab: initialTab }) : dialog.close()}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent title="Participantes" description="Veja quem votou e quem já terminou este jogo.">
        <Tabs.Root value={activeTab} onValueChange={value => dialog.setParam('modalTab', value)}>
          <Tabs.List className="participants-tabs app-tabs mx-4 mt-4 grid grid-cols-2 rounded-xl bg-black/30 p-1">
            <Tabs.Trigger value="votes" className="flex items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-bold text-zinc-500 outline-none transition data-[state=active]:bg-zinc-800 data-[state=active]:text-violet-300"><ThumbsUp className="size-3.5" />Votos · {voters.length}</Tabs.Trigger>
            <Tabs.Trigger value="completed" className="flex items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-bold text-zinc-500 outline-none transition data-[state=active]:bg-zinc-800 data-[state=active]:text-emerald-300"><CheckCircle2 className="size-3.5" />{formatFinishedCount(completed.length)}</Tabs.Trigger>
          </Tabs.List>
          <Tabs.Content value="votes" className="outline-none data-[state=active]:animate-tab-in"><PeopleList people={voters} empty="Ninguém votou neste jogo ainda." /></Tabs.Content>
          <Tabs.Content value="completed" className="outline-none data-[state=active]:animate-tab-in"><PeopleList people={completed} empty="Ninguém finalizou este jogo ainda." /></Tabs.Content>
        </Tabs.Root>
      </DialogContent>
    </Dialog>
  );
}
