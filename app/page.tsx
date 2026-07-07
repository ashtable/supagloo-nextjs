import Image from "next/image";

export default function Home() {
  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 dark:bg-black">
      <Image
        src="/supagloo-coming-soon-hero.jpg"
        alt="Coming soon"
        width={1408}
        height={768}
        priority
        className="h-auto w-full max-w-3xl px-6"
      />
    </div>
  );
}
