import { atom, useSetAtom } from "jotai";

export interface CrmDialogState {
  isOpen: boolean;
  type: "confirm" | "alert";
  title?: string;
  description?: string;
  confirmLabel?: string;
  resolve?: (value: boolean) => void;
}

export const crmDialogAtom = atom<CrmDialogState>({
  isOpen: false,
  type: "confirm",
});

export function useCrmDialog() {
  const setDialog = useSetAtom(crmDialogAtom);

  const confirm = (options: {
    title?: string;
    description?: string;
    confirmLabel?: string;
  }): Promise<boolean> => {
    return new Promise((resolve) => {
      setDialog({
        isOpen: true,
        type: "confirm",
        title: options.title,
        description: options.description,
        confirmLabel: options.confirmLabel,
        resolve: (value: boolean) => {
          setDialog((prev) => ({ ...prev, isOpen: false }));
          resolve(value);
        },
      });
    });
  };

  const alert = (message: string, options?: { title?: string }): Promise<void> => {
    return new Promise((resolve) => {
      setDialog({
        isOpen: true,
        type: "alert",
        title: options?.title,
        description: message,
        resolve: () => {
          setDialog((prev) => ({ ...prev, isOpen: false }));
          resolve();
        },
      });
    });
  };

  return { confirm, alert };
}
