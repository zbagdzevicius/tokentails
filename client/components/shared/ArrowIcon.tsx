interface ArrowIconProps {
  width?: number;
  height?: number;
  color?: string;
  className?: string;
}

export const ArrowIcon = ({
  width = 16,
  height = 16,
  color = "currentColor",
  className = "",
}: ArrowIconProps) => {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="M6 3L11 8L6 13"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};
