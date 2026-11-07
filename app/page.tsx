import Wall from "./wall";
import { getChatGPTUser, chatGPTSignInPath } from "./chatgpt-auth";
export const dynamic = "force-dynamic";
export default async function Home() {
  const user = await getChatGPTUser();
  if (!user) return <main className="signin-scene"><div className="signin-paper"><span className="tape" /><span className="eyebrow">A LITTLE ROOM FOR YOUR PLANS</span><h1>纸上<span>。</span></h1><p>把想做的事，慢慢做成。<br />一面墙，留给你的待办和计划。</p><a className="primary" href={chatGPTSignInPath("/")} target="_top">登录，打开我的墙 <span>↗</span></a><small>用同一个 ChatGPT 账号，在手机和电脑上打开。</small></div></main>;
  return <Wall />;
}
