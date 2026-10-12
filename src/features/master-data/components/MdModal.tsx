import type { ReactNode } from 'react';
import { PackagePlus } from '@untitledui/icons';
import { CloseButton } from '@/components/base/buttons/close-button';
import { FeaturedIcon } from '@/components/foundations/featured-icon/featured-icon';
import { Dialog, Modal, ModalOverlay } from '@/components/application/modals/modal';
import { cx } from '@/utils/cx';

interface Props {
  isOpen: boolean; onOpenChange(open: boolean): void;
  title: string; subtitle?: ReactNode;
  /** 640 px for every step except the CSV review table (840 px), as in Figma. */
  wide?: boolean;
  /** Two equal buttons at the bottom (Cancel/Back + primary). */
  actions: ReactNode;
  children?: ReactNode;
  /** Wrap in a form so Enter submits (manual add). */
  onSubmit?(): void;
}

/**
 * The one dialog layout of the material flow (Figma 642:59701 and siblings): package-plus featured icon, title, supporting text,
 * close X, content, then a 2-column action row. Every step of the flow renders inside this, so the steps only provide content.
 */
export function MdModal({ isOpen, onOpenChange, title, subtitle, wide, actions, children, onSubmit }: Props) {
  const body = (
    <>
      <div className="relative px-6 pt-6 pb-5">
        <FeaturedIcon icon={PackagePlus} color="gray" theme="modern" size="lg" />
        <h2 className="mt-4 text-md font-semibold text-primary">{title}</h2>
        {subtitle && <p className="text-sm text-tertiary">{subtitle}</p>}
        <CloseButton className="absolute top-4 right-4" size="sm" />
      </div>
      {children && <div className="flex flex-col gap-5 px-6">{children}</div>}
      <div className="grid grid-cols-2 gap-3 px-6 pt-8 pb-6">{actions}</div>
    </>
  );
  return (
    <ModalOverlay isOpen={isOpen} onOpenChange={onOpenChange} isDismissable>
      <Modal className={cx(wide ? 'max-w-[840px]' : 'max-w-[640px]')}>
        <Dialog aria-label={title}>
          {onSubmit ? <form noValidate onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>{body}</form> : body}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
