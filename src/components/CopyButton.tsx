type Props = {
  value: string;
  label: string;
  className?: string;
};

export function CopyButton({ value, label, className = 'btn btn-outline-primary button button-secondary' }: Props) {
  return (
    <button
      type="button"
      className={className}
      onClick={async (event) => {
        const button = event.currentTarget;
        try {
          await navigator.clipboard.writeText(value);
        } catch {
          const field = document.createElement('textarea');
          field.value = value;
          document.body.appendChild(field);
          field.select();
          document.execCommand('copy');
          field.remove();
        }
        const previous = button.textContent;
        button.textContent = 'Copiado';
        window.setTimeout(() => {
          button.textContent = previous;
        }, 1600);
      }}
    >
      {label}
    </button>
  );
}
