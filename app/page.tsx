import { getIndex, getFeed } from "./data";
import RingApp from "./RingApp";

export default async function Page() {
  const [index, feed] = await Promise.all([getIndex(), getFeed()]);
  return <RingApp index={index} feed={feed} />;
}
