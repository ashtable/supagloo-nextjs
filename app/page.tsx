import { ApiClient, BibleClient } from "@youversion/platform-core";

const appKey = process.env.YV_APP_KEY;
if (!appKey) throw new Error("YV_APP_KEY is not set");

const apiClient = new ApiClient({ appKey });
const bibleClient = new BibleClient(apiClient);
const passage = await bibleClient.getPassage(3034, "JHN.3.16", "text");
const version = await bibleClient.getVersion(3034);
const [book, chapter, verse] = passage.id.split(".");

export default function Home() {
  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 dark:bg-black">
      <div className="mx-auto max-w-prose space-y-4 px-6">
        <p className="text-lg leading-relaxed text-zinc-900 dark:text-zinc-100">
          {passage.content}
        </p>
        <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300">
          {book} {chapter}:{verse} ({version.abbreviation})
        </p>
        {version.copyright && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {version.copyright}
          </p>
        )}
      </div>
    </div>
  );
}
