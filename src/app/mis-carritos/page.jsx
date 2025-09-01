
import LookerEmbed from "../LookerEmbed";
import Banner from "../components/Banner"
export default function Page() {

  const src="https://lookerstudio.google.com/embed/reporting/0076c8f5-2d48-4e45-b9a2-a84c889a706d/page/p_ayx0o595qd"

  return (
    <div className="">
        <Banner/>
      <main className="flex flex-col gap-[32px] row-start-2 items-center sm:items-start">


        <LookerEmbed src={src}/>
      </main>

  
    </div>
  );
}
