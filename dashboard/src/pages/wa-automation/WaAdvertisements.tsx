import { Megaphone, Trash2 } from 'lucide-react';
import { Card, CardBody, CardFooter } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Modal, ModalBody, ModalFooter } from '../../components/ui/Modal';
import { CardGridSkeleton } from '../../components/Skeleton';
import { useToast } from '../../components/Toast';
import { useWaAdvertisementsQuery, useDeleteAdMutation } from '../../hooks/wa-queries';
import { useState } from 'react';

const statusVariant = (status: string) => {
  switch (status) {
    case 'active': return 'success' as const;
    case 'draft': return 'neutral' as const;
    default: return 'info' as const;
  }
};

export default function WaAdvertisements() {
  const { data: ads = [], isLoading } = useWaAdvertisementsQuery();
  const deleteMutate = useDeleteAdMutation();
  const { success, error: showError } = useToast();
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; title: string } | null>(null);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMutate.mutateAsync(deleteTarget.id);
      success('Advertisement deleted', `"${deleteTarget.title}" removed`);
      setDeleteTarget(null);
    } catch (e: any) {
      showError('Failed to delete advertisement', e.message);
    }
  };

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Advertisements</h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">Manage promotional ads sent to WhatsApp groups</p>
      </div>

      {isLoading ? (
        <CardGridSkeleton count={6} />
      ) : ads.length === 0 ? (
        <Card>
          <CardBody>
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Megaphone size={40} className="text-[var(--color-text-muted)] mb-3" />
              <p className="text-sm font-medium text-[var(--color-text-secondary)]">No advertisements yet</p>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">Create ads via the API to get started</p>
            </div>
          </CardBody>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {ads.map((a: any) => (
            <Card key={a.id} hover>
              <CardBody>
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-[var(--color-primary)]/10 flex items-center justify-center flex-shrink-0 text-[var(--color-primary)]">
                      <Megaphone size={15} />
                    </div>
                    <h3 className="font-semibold text-sm text-[var(--color-text)] truncate">{a.title}</h3>
                  </div>
                  <Badge variant={statusVariant(a.status)} className="flex-shrink-0">{a.status}</Badge>
                </div>
                <p className="text-xs text-[var(--color-text-secondary)] line-clamp-3 mb-3 leading-relaxed">{a.body}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--color-text-secondary)]">
                  <span>Target: <strong>{a.targetType}</strong></span>
                  <span>Package: <strong>{a.daysUsed}/{a.packageDays}d</strong></span>
                  <span>Sent: <strong>{a.totalSent}</strong> / Failed: <strong>{a.totalFailed}</strong></span>
                </div>
              </CardBody>
              <CardFooter>
                <Button size="sm" variant="danger" icon={Trash2} onClick={() => setDeleteTarget({ id: a.id, title: a.title })}>
                  Delete
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete Advertisement">
        <ModalBody>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Are you sure you want to delete <strong>"{deleteTarget?.title}"</strong>? This action cannot be undone.
          </p>
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button variant="danger" onClick={handleDelete} loading={deleteMutate.isPending}>Delete</Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
