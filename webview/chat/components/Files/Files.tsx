import styles from "./Files.module.css";

interface FilesProps {
  files: { name: string; path: string }[];
  onOpen: (filePath: string) => void;
}

export function Files({ files, onOpen }: FilesProps) {
  return (
    <div className={styles.files}>
      {files.map((file) => (
        <button
          key={file.path}
          className={styles.file}
          title={`Open ${file.path}`}
          onClick={() => onOpen(file.path)}
        >
          {file.name}
        </button>
      ))}
    </div>
  );
}
