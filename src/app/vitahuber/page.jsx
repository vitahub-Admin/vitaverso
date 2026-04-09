import SharecartsClient from "./components/SharecartsClient";

async function getSharecarts() {
  const res = await fetch("https://pro.vitahub.mx/api/sharecart", {
    headers: {
      "x-api-key": process.env.SHARECART_API_KEY,
    },
    cache: "no-store",
  });

  const data = await res.json();
  return data.list || [];
}

export default async function SharecartsPage() {
  const carts = await getSharecarts();
  return <SharecartsClient carts={carts} />;
}
