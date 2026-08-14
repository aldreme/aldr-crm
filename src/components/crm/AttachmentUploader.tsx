import { uploadMedia } from "@/lib/api/crm-api";
import type { Attachment } from "@/lib/types/crm";
import { Button, Spinner } from "@heroui/react";
import { Paperclip, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { useCrmTranslation } from "./CrmI18nProvider";

interface AttachmentUploaderProps {
  value: Attachment[];
  onChange: (value: Attachment[]) => void;
}

export function AttachmentUploader({ value, onChange }: AttachmentUploaderProps) {
  const { t } = useCrmTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const next = [...value];
      for (const file of Array.from(files)) {
        const uploaded = await uploadMedia(file);
        next.push({
          file_token: uploaded.file_token,
          name: uploaded.name,
          size: uploaded.size,
          type: uploaded.type,
        });
      }
      onChange(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  };

  const remove = (index: number) => {
    const next = value.filter((_, i) => i !== index);
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="bordered"
          radius="full"
          onPress={() => inputRef.current?.click()}
          isDisabled={uploading}
          startContent={uploading ? <Spinner size="sm" /> : <Paperclip className="w-4 h-4" />}
        >
          {uploading ? t("crm.attachment.uploading") : t("crm.attachment.upload")}
        </Button>
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
      {value.length === 0 ? (
        <p className="text-xs text-gray-400 dark:text-zinc-500">{t("crm.attachment.empty")}</p>
      ) : (
        <ul className="space-y-1">
          {value.map((att, i) => (
            <li key={i} className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate">{att.name}</span>
              <button
                type="button"
                onClick={() => remove(i)}
                className="text-red-500 hover:text-red-600"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
