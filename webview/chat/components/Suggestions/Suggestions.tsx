import styles from "./Suggestions.module.css";

interface SuggestionsProps {
  suggestions: string[];
  onSuggest: (suggestion: string) => void;
}

export function Suggestions({ suggestions, onSuggest }: SuggestionsProps) {
  const handleClick = (suggestion: string) => {
    onSuggest(suggestion);
  };

  return (
    <div className={styles.suggestions}>
      {suggestions.map((suggestion) => (
        <button
          key={suggestion}
          className={styles.suggestion}
          onClick={() => handleClick(suggestion)}
        >
          {suggestion}
        </button>
      ))}
    </div>
  );
}
