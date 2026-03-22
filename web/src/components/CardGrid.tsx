import { MemoryCard } from './MemoryCard';
import type { Memory } from '../types';

interface CardGridProps {
  memories: Memory[];
  onDelete?: (id: number) => void;
  onUpdate?: (id: number, text: string) => Promise<void>;
}

export function CardGrid({ memories, onDelete, onUpdate }: CardGridProps) {
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-2">
      {memories.map((memory, index) => (
        <MemoryCard
          key={memory.id}
          memory={memory}
          index={index}
          onDelete={onDelete}
          onUpdate={onUpdate}
        />
      ))}
    </div>
  );
}
