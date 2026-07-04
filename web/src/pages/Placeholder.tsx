export default function Placeholder({ title }: { title: string }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold mb-2">{title}</h1>
      <div className="bg-white rounded-xl border border-slate-200 border-dashed p-10 text-center text-slate-400">
        {title} modülü yakında — bu ekran sıradaki adımda kurulacak.
      </div>
    </div>
  );
}
