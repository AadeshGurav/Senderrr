import { useWaWorkersQuery, useWaAdminsQuery } from '../../hooks/wa-queries';
import { DataTable } from '../../components/ui/DataTable';
import { Badge } from '../../components/ui/Badge';
import { PageSkeleton } from '../../components/Skeleton';
import { Cpu } from 'lucide-react';
import { Card, CardBody } from '../../components/ui/Card';
import type { ColumnDef } from '@tanstack/react-table';
import type { ApiAdmin, ApiWorker } from '../../services/wa-api';


const statusVariant = (status: string) => {
  switch (status) {
    case 'active': return 'success' as const;
    case 'idle': return 'info' as const;
    case 'error': return 'error' as const;
    case 'offline': return 'neutral' as const;
    default: return 'warning' as const;
  }
};

export default function WaWorkers() {
  const { data: workers = [], isLoading } = useWaWorkersQuery();
  const { data: admins = [] } = useWaAdminsQuery();

  const adminLabel = (adminId: number) =>
    (admins as ApiAdmin[]).find(a => a.id === adminId)?.label || `Admin #${adminId}`;

  const columns: ColumnDef<ApiWorker, unknown>[] = [
    {
      accessorKey: 'workerId',
      header: 'Worker ID',
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.workerId}</span>,
    },
    {
      accessorKey: 'adminId',
      header: 'Admin',
      cell: ({ row }) => adminLabel(row.original.adminId),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => <Badge variant={statusVariant(row.original.status)}>{row.original.status}</Badge>,
    },
    {
      accessorKey: 'browserStatus',
      header: 'Browser',
      cell: ({ row }) => <Badge variant="neutral">{row.original.browserStatus}</Badge>,
    },
    { accessorKey: 'totalSent', header: 'Sent' },
    { accessorKey: 'totalFailed', header: 'Failed' },
    {
      accessorKey: 'lastHeartbeatAt',
      header: 'Last Heartbeat',
      cell: ({ row }) => (
        <span className="text-xs text-[var(--color-text-secondary)]">
          {row.original.lastHeartbeatAt ? new Date(row.original.lastHeartbeatAt).toLocaleString() : '-'}
        </span>
      ),
    },
    {
      accessorKey: 'currentGroupId',
      header: 'Current Group',
      cell: ({ row }) => (
        <span className="text-xs text-[var(--color-text-secondary)] truncate max-w-[150px] inline-block">
          {row.original.currentGroupId || '-'}
        </span>
      ),
    },
  ];

  if (isLoading) return <PageSkeleton />;

  if (workers.length === 0) {
    return (
      <div className="p-4 md:p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text)]">Worker Sessions</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">Monitor active automation worker processes</p>
        </div>
        <Card>
          <CardBody>
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Cpu size={40} className="text-[var(--color-text-muted)] mb-3" />
              <p className="text-sm font-medium text-[var(--color-text-secondary)]">No worker sessions</p>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">Workers are created automatically on first heartbeat from the automation engine</p>
            </div>
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Worker Sessions</h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">Monitor active automation worker processes</p>
      </div>

      <DataTable
        columns={columns}
        data={workers}
        searchable
        searchKeys={['workerId']}
        paginated
        emptyMessage="No worker sessions found"
      />
    </div>
  );
}
