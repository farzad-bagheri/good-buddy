import styles from "./Suggestions.module.css";

interface SuggestionsProps {
  suggestions: string[];
  onSuggest: (suggestion: string) => void;
}

export function Suggestions({ suggestions, onSuggest }: SuggestionsProps) {
  return (
    <div className={styles.suggestions}>
      {suggestions.map((suggestion) => (
        <button
          key={suggestion}
          className={styles.suggestion}
          onClick={() => {
            onSuggest(suggestion);
          }}
        >
          {suggestion}
        </button>
      ))}
    </div>
  );
}
