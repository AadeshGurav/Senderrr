import { useState } from 'react';
import { FileText, Eye, Save, Trash2, CheckCircle } from 'lucide-react';
import { Card, CardBody } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Input, Textarea } from '../../components/ui/Input';
import { Modal, ModalBody, ModalFooter } from '../../components/ui/Modal';
import { PageSkeleton } from '../../components/Skeleton';
import { useToast } from '../../components/Toast';
import {
  useWaTemplatesQuery,
  useActiveTemplateQuery,
  useCreateTemplateMutation,
  useUpdateTemplateMutation,
  useActivateTemplateMutation,
  useDeleteTemplateMutation,
} from '../../hooks/wa-queries';
import { templateApi } from '../../services/wa-api';

export default function WaTemplates() {
  const { data: templates = [], isLoading: templatesLoading } = useWaTemplatesQuery();
  const { data: active } = useActiveTemplateQuery();
  const createMutate = useCreateTemplateMutation();
  const updateMutate = useUpdateTemplateMutation();
  const activateMutate = useActivateTemplateMutation();
  const deleteMutate = useDeleteTemplateMutation();
  const { success, error: showError } = useToast();

  const [edit, setEdit] = useState<{ id?: number; name: string; templateText: string }>({ name: '', templateText: '' });
  const [preview, setPreview] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);

  const handlePreview = async () => {
    setPreviewLoading(true);
    try {
      const res = await templateApi.preview(edit.templateText);
      setPreview(res.rendered);
    } catch {
      setPreview('Preview error');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      if (edit.id) {
        await updateMutate.mutateAsync({ id: edit.id, name: edit.name, templateText: edit.templateText });
        success('Template updated');
      } else {
        await createMutate.mutateAsync({ name: edit.name, templateText: edit.templateText });
        success('Template created');
      }
      setEdit({ name: '', templateText: '' });
      setPreview('');
    } catch (e: any) {
      showError('Failed to save template', e.message);
    }
  };

  const handleActivate = async (id: number) => {
    await activateMutate.mutateAsync(id);
    success('Template activated');
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMutate.mutateAsync(deleteTarget.id);
      success('Template deleted');
      setDeleteTarget(null);
    } catch (e: any) {
      showError('Failed to delete', e.message);
    }
  };

  if (templatesLoading) return <PageSkeleton />;

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Message Templates</h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">Create and manage message templates with dynamic placeholders</p>
      </div>

      {active && (
        <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4 flex items-start gap-3">
          <CheckCircle size={18} className="text-emerald-600 dark:text-emerald-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
              Active Template: {active.name}
            </p>
            <pre className="mt-1.5 text-xs text-emerald-700 dark:text-emerald-400 whitespace-pre-wrap font-mono">{active.templateText}</pre>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Editor */}
        <Card>
          <CardBody className="space-y-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)] flex items-center gap-2">
              <FileText size={14} />
              {edit.id ? 'Edit Template' : 'New Template'}
            </h2>
            <Input
              label="Template Name"
              value={edit.name}
              onChange={e => setEdit({ ...edit, name: e.target.value })}
              placeholder="e.g., Daily News Broadcast"
            />
            <Textarea
              label="Template Text"
              rows={8}
              value={edit.templateText}
              onChange={e => setEdit({ ...edit, templateText: e.target.value })}
              placeholder="Use {news.title} and {news.body} placeholders..."
              className="font-mono text-xs"
            />
            <div className="flex gap-2">
              <Button icon={Save} onClick={handleSave} loading={createMutate.isPending || updateMutate.isPending}>
                {edit.id ? 'Update' : 'Create'}
              </Button>
              <Button variant="secondary" icon={Eye} onClick={handlePreview} loading={previewLoading}>
                Preview
              </Button>
            </div>

            {preview && (
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400 mb-2">Preview</h3>
                <div className="text-sm text-amber-900 dark:text-amber-200 whitespace-pre-wrap">{preview}</div>
              </div>
            )}
          </CardBody>
        </Card>

        {/* Template List */}
        <Card>
          <CardBody>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)] flex items-center gap-2 mb-4">
              <FileText size={14} />
              Saved Templates
            </h2>
            {templates.length === 0 ? (
              <p className="text-sm text-[var(--color-text-muted)] py-4 text-center">No templates yet</p>
            ) : (
              <div className="space-y-3">
                {templates.map((t: any) => (
                  <div
                    key={t.id}
                    className={`p-3 rounded-xl border transition-colors ${
                      t.isActive
                        ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/10'
                        : 'border-[var(--color-border)]'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm text-[var(--color-text)]">{t.name}</span>
                        {t.isActive && <Badge variant="success">Active</Badge>}
                      </div>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEdit({ id: t.id, name: t.name, templateText: t.templateText })}
                        >
                          Edit
                        </Button>
                        {!t.isActive && (
                          <Button size="sm" variant="ghost" onClick={() => handleActivate(t.id)}>
                            Activate
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => setDeleteTarget({ id: t.id, name: t.name })}>
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </div>
                    <pre className="text-xs text-[var(--color-text-secondary)] whitespace-pre-wrap line-clamp-3 font-mono">
                      {t.templateText}
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete Template">
        <ModalBody>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Are you sure you want to delete <strong>"{deleteTarget?.name}"</strong>?
          </p>
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button variant="danger" onClick={handleDelete}>Delete</Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
