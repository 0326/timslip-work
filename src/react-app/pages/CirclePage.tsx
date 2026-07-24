import { Footer } from '../components/Common/Footer';
import '../components/Circle/circle.css';

const FEATURES = [
  { name: '与古人畅谈聊天', desc: '跟司马迁论史、跟李白饮酒、与孔子谈仁。半文半白，引经据典。', img: '/assets/circle-feature-chat.jpg' },
  { name: '看古人发朋友圈', desc: '曹操赤壁船上发视频：今天风好大。程昱：稳住，别浪！', img: '/assets/circle-feature-moments.jpg' },
  { name: '阅读古籍学历史', desc: '二十四史随身读，原文译文对照，AI 助你理解每一个典故。', img: '/assets/circle-feature-reading.jpg' },
  { name: '体验皇帝批奏折', desc: '化身帝王，亲批韩信请封、晁错削藩。你的每个决策都决定历史走向。', img: '/assets/circle-feature-memorial.jpg' },
  { name: '历史人物大测试', desc: '测测你最像哪位历史人物？生成你的穿越人设和专属画像。', img: '/assets/circle-feature-quiz.jpg' },
  { name: '看古人视频直播', desc: '项羽直播PK，西施直播卖豆腐，古人也能玩转直播间。', img: '/assets/circle-feature-livestream.jpg' },
];

export default function CirclePage() {
  return (
    <div className="circle-page">
      {/* Hero Banner */}
      <section className="circle-hero">
        <img
          className="circle-hero-bg"
          src="/assets/circle-banner.jpg"
          alt=""
        />
        <div className="circle-hero-overlay">
          <div className="circle-hero-text">
            <span className="circle-hero-badge">微信小程序</span>
            <h1 className="circle-hero-title">穿越兰台圈</h1>
            <p className="circle-hero-subtitle">
              和古人做<em>朋友</em>，与千年前的灵魂来一场<em>对话</em>，在他们的<em>朋友圈</em>里点赞！<br />
              历史人物大<em>测试</em>，穿越过去，体验皇帝的快乐，<em>日理万机</em>，<em>批奏折</em>...
            </p>
          </div>
          <div className="circle-hero-qr">
            <div className="circle-qr-wrap">
              <img
                src="/assets/mini-qrcode.jpg"
                alt="小程序二维码"
              />
            </div>
            <span className="circle-qr-hint">微信扫一扫</span>
          </div>
        </div>
      </section>

      <div className="circle-page-content">
        {/* Features */}
        <h2 className="circle-section-title">与古人对话，共续千秋，来穿越兰台，趣读历史</h2>
        <div className="circle-features">
          {FEATURES.map((f) => (
            <div className="circle-feature-card" key={f.name}>
              <img className="circle-feature-img" src={f.img} alt={f.name} />
              <div className="circle-feature-body">
                <h3 className="circle-feature-name">{f.name}</h3>
                <p className="circle-feature-desc">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom CTA */}
        <section className="circle-bottom-cta">
          <h2 className="circle-bottom-cta-title">微信扫码，立即穿越</h2>
          <div className="circle-bottom-cta-row">
            <img
              className="circle-bottom-qr"
              src="/assets/mini-qrcode.jpg"
              alt="小程序二维码"
            />
            <div className="circle-bottom-cta-text">
              微信搜索<strong>「穿越兰台圈」</strong><br />
              或扫描左侧二维码<br />
              <br />
              更多有趣玩法，等你来探索~
            </div>
          </div>
        </section>
      </div>
      <Footer />
    </div>
  );
}
