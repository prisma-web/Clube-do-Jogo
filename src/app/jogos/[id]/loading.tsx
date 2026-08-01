import { Skeleton } from '@/components/ui/skeleton';

export default function GameLoading() {
  return <div className="mx-auto max-w-4xl space-y-4"><Skeleton className="-mx-4 aspect-video rounded-none sm:-mx-8" /><Skeleton className="h-10 w-2/3" /><div className="flex gap-2"><Skeleton className="h-8 w-20 rounded-full" /><Skeleton className="h-8 w-24 rounded-full" /></div><Skeleton className="h-12 w-full rounded-2xl" /><Skeleton className="h-56 w-full rounded-3xl" /></div>;
}
