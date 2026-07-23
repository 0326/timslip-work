import { Header } from "../components/Common/Header";
import { Footer } from "../components/Common/Footer";
import "../components/About/about.css";

export default function AboutPage() {
  return (
    <div className="about-page">
      <Header />
      <div className="about-page-content">
        <h1 className="about-page-title">
          <img
            src="/logo/logo-512.png"
            alt="穿越·兰台"
            className="about-page-logo"
          />
        </h1>
        {/* 关于项目 */}
        <section className="about-section">
          <h2 className="about-section-title">关于项目</h2>
          <div className="about-section-body">
            <p>
              timeslip.work
              「穿越·兰台」是一个以数字化方式呈现中国古代历史的公益项目。
              <br />
              timeslip
              有「穿越」之意，我们期望通过数字化和游戏化的方式，让大家有穿越时空，亲临历史之感。
              <br />
              work
              即作品、工坊，这里借用「兰台」之意，即古代史官与藏书之所，刚好契合我们的愿景。
              <br />
            </p>
            <p>
              本项目立足公益，愿以技术之力降低接触原典的门槛。正史卷帙浩繁，常人难以卒读；我们将其拆解为可检索、可穿越、可漫游的数字长河，
              让每一位愿意回望的人，都能在此找到入口。也希望给教育和学习工作者提供一份可信、可读、可玩的史地辅助工具——
              不替代课本，而是为课本补上一幅可触摸的时空底图。
            </p>
            <p>
              项目数据来源于公开的历史文献、学术研究和数字化资料，经过AI整理和加工后呈现，可能存在疏漏或错误，如有发现，欢迎反馈：1833559609@qq.com
            </p>
          </div>
        </section>

        {/* 关于作者 */}
        <section className="about-section">
          <h2 className="about-section-title">关于作者</h2>
          <div className="about-section-body">
            <p>
              前阿里、蚂蚁、字节程序员，现 AI
              全栈工程师。这是我业余时间做的兴趣项目，后续会持续维护升级。
              <br />
              当前项目由于参加比赛中暂时闭源，后续会GitHub开源，欢迎一起参与建设。
              <br />
            </p>
          </div>
        </section>

        {/* 感谢 */}
        <section className="about-section">
          <h2 className="about-section-title">感谢</h2>
          <div className="about-section-body">
            <p>本项目由 TRAE AI 全力打造，感谢 TRAE 团队提供的算力支持。</p>
          </div>
        </section>
      </div>
      <Footer />
    </div>
  );
}
