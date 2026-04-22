export const ProgressBar = ({ progress }: { progress: number }) => {
  if (!progress) return null;

  return (
    <div className="absolute top-0 h-4 lg:h-8 left-0 right-0 animate-colormax p-1 lg:p-2 mt-safe">
      <div
        className="h-full bg-red-500 rounded-full"
        style={{ width: `${progress}%` }}
      ></div>
    </div>
  );
};
