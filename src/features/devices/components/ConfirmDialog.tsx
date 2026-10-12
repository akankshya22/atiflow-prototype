import { Trash01 } from '@untitledui/icons';
import { Button } from '@/components/base/buttons/button';
import { FeaturedIcon } from '@/components/foundations/featured-icon/featured-icon';
import { Dialog, Modal, ModalOverlay } from '@/components/application/modals/modal';

interface Props { isOpen: boolean; onOpenChange(o: boolean): void; title: string; description: string; confirmLabel: string; onConfirm(): void }
/** Small destructive confirmation built from the Untitled UI modal. */
export function ConfirmDialog({ isOpen, onOpenChange, title, description, confirmLabel, onConfirm }: Props) {
  return (
    <ModalOverlay isOpen={isOpen} onOpenChange={onOpenChange} isDismissable>
      <Modal className="max-w-100"><Dialog aria-label={title}>
        <div className="flex flex-col gap-4 p-6">
          <FeaturedIcon icon={Trash01} color="error" theme="light" size="lg" />
          <div className="flex flex-col gap-1"><h2 className="text-lg font-semibold text-primary">{title}</h2><p className="text-sm text-tertiary">{description}</p></div>
          <div className="grid grid-cols-2 gap-3 pt-2">
            <Button color="secondary" size="lg" onPress={() => onOpenChange(false)}>Cancel</Button>
            <Button color="primary-destructive" size="lg" onPress={() => { onConfirm(); onOpenChange(false); }}>{confirmLabel}</Button>
          </div>
        </div>
      </Dialog></Modal>
    </ModalOverlay>
  );
}
