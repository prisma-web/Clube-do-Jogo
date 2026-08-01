import { ListSkeleton, Skeleton } from '@/components/ui/skeleton';

export default function ProfileLoading() {
  return <div className="mx-auto max-w-3xl"><Skeleton className="mx-auto size-24 rounded-full" /><Skeleton className="mx-auto mt-4 h-7 w-44" /><Skeleton className="mx-auto mt-3 h-4 w-64" /><div className="mt-8"><ListSkeleton count={4} /></div></div>;
}
