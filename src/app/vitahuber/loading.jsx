export default function Loading() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <div className="w-10 h-10 border-4 border-[#1b3f7a] border-t-transparent rounded-full animate-spin" />
      <p className="text-gray-500 text-sm">Cargando carritos...</p>
    </div>
  );
}
