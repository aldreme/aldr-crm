import { crmDialogAtom } from "@/store/crm-ui";
import {
  Button,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from "@heroui/react";
import { Trash2 } from "lucide-react";
import { useAtom } from "jotai";
import { useCrmTranslation } from "./CrmI18nProvider";

export function CrmDialogContainer() {
  const [dialog, setDialog] = useAtom(crmDialogAtom);
  const { t } = useCrmTranslation();

  const close = (value: boolean) => {
    dialog.resolve?.(value);
    setDialog((prev) => ({ ...prev, isOpen: false }));
  };

  return (
    <Modal
      isOpen={dialog.isOpen}
      onOpenChange={(open) => !open && close(false)}
      backdrop="blur"
      hideCloseButton
    >
      <ModalContent>
        {() => (
          <>
            <ModalHeader className="flex flex-col gap-1">
              {dialog.title}
            </ModalHeader>
            <ModalBody>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                {dialog.description}
              </p>
            </ModalBody>
            <ModalFooter>
              {dialog.type === "confirm" && (
                <Button variant="light" onPress={() => close(false)}>
                  {t("crm.cancel")}
                </Button>
              )}
              <Button
                color={dialog.type === "confirm" ? "danger" : "primary"}
                startContent={dialog.type === "confirm" ? <Trash2 className="w-4 h-4" /> : undefined}
                onPress={() => close(true)}
              >
                {dialog.type === "confirm"
                  ? dialog.confirmLabel || t("crm.confirm")
                  : t("crm.ok")}
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
