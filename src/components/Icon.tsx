type Props = {
  name: string;
};

export function Icon({ name }: Props) {
  return (
    <span className="material-symbols-outlined" aria-hidden="true">
      {name}
    </span>
  );
}
