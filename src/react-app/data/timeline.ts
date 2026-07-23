// 首页时间轴静态数据：从 Turso 一次性导出，避免运行时依赖 /api/timeline。
// 数据极少变动（24 部正史的朝代轴）；如需更新，见 docs/MIGRATE_TURSO.md 重新导出。
import type { TimelineData } from "./types";

export const TIMELINE_DATA: TimelineData = {
  "range": {
    "start": -2550,
    "end": 1644
  },
  "dynasties": [
    {
      "id": "wudi",
      "name": "五帝时代",
      "start_year": -2550,
      "end_year": -2070,
      "book_ids": [
        "shiji"
      ],
      "book_label": "《史记》",
      "img": "dynasties/wudi.jpg",
      "description": "黄帝、颛顼、帝喾、尧、舜，华夏文明的开端。太史公以《五帝本纪》开篇，述华夏始祖之功德。",
      "is_active": true
    },
    {
      "id": "xia",
      "name": "夏",
      "start_year": -2070,
      "end_year": -1600,
      "book_ids": [
        "shiji"
      ],
      "book_label": "《史记》",
      "img": "dynasties/xia.jpg",
      "description": "大禹治水，家天下始。中国第一个世袭制王朝，四百余年兴衰。",
      "is_active": true
    },
    {
      "id": "shang",
      "name": "商",
      "start_year": -1600,
      "end_year": -1046,
      "book_ids": [
        "shiji"
      ],
      "book_label": "《史记》",
      "img": "dynasties/shang.jpg",
      "description": "甲骨文、青铜器，中国有文字可考的历史自此始。盘庚迁殷，武丁中兴。",
      "is_active": true
    },
    {
      "id": "xizhou",
      "name": "西周",
      "start_year": -1046,
      "end_year": -771,
      "book_ids": [
        "shiji"
      ],
      "book_label": "《史记》",
      "img": "dynasties/xizhou.jpg",
      "description": "武王伐纣，分封诸侯。周公制礼作乐，奠定华夏文明根基。",
      "is_active": true
    },
    {
      "id": "chunqiu",
      "name": "春秋",
      "start_year": -770,
      "end_year": -476,
      "book_ids": [
        "shiji"
      ],
      "book_label": "《史记》",
      "img": "dynasties/chunqiu.jpg",
      "description": "平王东迁，诸侯争霸。孔子周游列国，百家争鸣之始。",
      "is_active": true
    },
    {
      "id": "zhanguo",
      "name": "战国",
      "start_year": -475,
      "end_year": -221,
      "book_ids": [
        "shiji"
      ],
      "book_label": "《史记》",
      "img": "dynasties/zhanguo.jpg",
      "description": "七雄并立，合纵连横。秦并六国，天下归一。",
      "is_active": true
    },
    {
      "id": "qin",
      "name": "秦",
      "start_year": -221,
      "end_year": -207,
      "book_ids": [
        "shiji"
      ],
      "book_label": "《史记》",
      "img": "dynasties/qin.jpg",
      "description": "千古一帝，书同文车同轨。长城、兵马俑，帝国之始。",
      "is_active": true
    },
    {
      "id": "chuhan",
      "name": "楚汉",
      "start_year": -206,
      "end_year": -202,
      "book_ids": [
        "shiji"
      ],
      "book_label": "《史记》",
      "img": "dynasties/chuhan.jpg",
      "description": "霸王别姬，垓下之战。刘邦胜出，开四百年汉室基业。",
      "is_active": true
    },
    {
      "id": "xihan",
      "name": "西汉",
      "start_year": -202,
      "end_year": 8,
      "book_ids": [
        "shiji",
        "hanshu"
      ],
      "book_label": "《史记》《汉书》",
      "img": "dynasties/xihan.jpg",
      "description": "文景之治，汉武开疆。丝绸之路通西域，太史公著《史记》。",
      "is_active": true
    },
    {
      "id": "d10",
      "name": "东汉",
      "start_year": 25,
      "end_year": 220,
      "book_ids": [
        "houhanshu"
      ],
      "book_label": "《后汉书》",
      "img": "dynasties/d10.jpg",
      "description": "光武中兴，班超出使西域。党锢之祸，汉室倾颓。",
      "is_active": false
    },
    {
      "id": "d11",
      "name": "三国",
      "start_year": 220,
      "end_year": 280,
      "book_ids": [
        "sanguozhi"
      ],
      "book_label": "《三国志》",
      "img": "dynasties/d11.jpg",
      "description": "魏蜀吴三足鼎立，英雄辈出的时代。",
      "is_active": false
    },
    {
      "id": "d12",
      "name": "西晋",
      "start_year": 265,
      "end_year": 316,
      "book_ids": [
        "jinshu"
      ],
      "book_label": "《晋书》",
      "img": "dynasties/d12.jpg",
      "description": "司马氏代魏，短暂统一。八王之乱，衣冠南渡。",
      "is_active": false
    },
    {
      "id": "d13",
      "name": "东晋",
      "start_year": 317,
      "end_year": 420,
      "book_ids": [
        "jinshu"
      ],
      "book_label": "《晋书》",
      "img": "dynasties/d13.jpg",
      "description": "偏安江南，祖逖北伐。淝水之战，以少胜多。",
      "is_active": false
    },
    {
      "id": "d15",
      "name": "北朝",
      "start_year": 386,
      "end_year": 581,
      "book_ids": [
        "weishu",
        "beiqishu",
        "zhoushu",
        "beishi"
      ],
      "book_label": "《魏书》《北齐书》《周书》《北史》",
      "img": "dynasties/d15.jpg",
      "description": "北魏孝文帝改革，北齐北周对峙。",
      "is_active": false
    },
    {
      "id": "d14",
      "name": "南朝",
      "start_year": 420,
      "end_year": 589,
      "book_ids": [
        "songshu",
        "nanqishu",
        "liangshu",
        "chenshu",
        "nanshi"
      ],
      "book_label": "《宋书》《南齐书》《梁书》《陈书》《南史》",
      "img": "dynasties/d14.jpg",
      "description": "宋齐梁陈四朝更迭，南北对峙。",
      "is_active": false
    },
    {
      "id": "d16",
      "name": "隋",
      "start_year": 581,
      "end_year": 618,
      "book_ids": [
        "suishu"
      ],
      "book_label": "《隋书》",
      "img": "dynasties/d16.jpg",
      "description": "开凿大运河，科举制诞生。二世而亡。",
      "is_active": false
    },
    {
      "id": "d17",
      "name": "唐",
      "start_year": 618,
      "end_year": 907,
      "book_ids": [
        "jiutangshu",
        "xintangshu"
      ],
      "book_label": "《旧唐书》《新唐书》",
      "img": "dynasties/d17.jpg",
      "description": "贞观之治，开元盛世。",
      "is_active": false
    },
    {
      "id": "d18",
      "name": "五代",
      "start_year": 907,
      "end_year": 960,
      "book_ids": [
        "jiuwudaishi",
        "xinwudaishi"
      ],
      "book_label": "《旧五代史》《新五代史》",
      "img": "dynasties/d18.jpg",
      "description": "乱世纷争，十国并立。",
      "is_active": false
    },
    {
      "id": "d21",
      "name": "辽",
      "start_year": 907,
      "end_year": 1125,
      "book_ids": [
        "liaoshi"
      ],
      "book_label": "《辽史》",
      "img": "dynasties/d21.jpg",
      "description": "契丹帝国，草原霸主。",
      "is_active": false
    },
    {
      "id": "d19",
      "name": "北宋",
      "start_year": 960,
      "end_year": 1127,
      "book_ids": [
        "songshi"
      ],
      "book_label": "《宋史》",
      "img": "dynasties/d19.jpg",
      "description": "文治鼎盛，经济繁荣。",
      "is_active": false
    },
    {
      "id": "d22",
      "name": "金",
      "start_year": 1115,
      "end_year": 1234,
      "book_ids": [
        "jinshi"
      ],
      "book_label": "《金史》",
      "img": "dynasties/d22.jpg",
      "description": "女真崛起，靖康之变。",
      "is_active": false
    },
    {
      "id": "d20",
      "name": "南宋",
      "start_year": 1127,
      "end_year": 1279,
      "book_ids": [
        "songshi"
      ],
      "book_label": "《宋史》",
      "img": "dynasties/d20.jpg",
      "description": "偏安江南，岳飞抗金。",
      "is_active": false
    },
    {
      "id": "d23",
      "name": "元",
      "start_year": 1271,
      "end_year": 1368,
      "book_ids": [
        "yuanshi"
      ],
      "book_label": "《元史》",
      "img": "dynasties/d23.jpg",
      "description": "蒙古铁骑，横扫欧亚。",
      "is_active": false
    },
    {
      "id": "d24",
      "name": "明",
      "start_year": 1368,
      "end_year": 1644,
      "book_ids": [
        "mingshi"
      ],
      "book_label": "《明史》",
      "img": "dynasties/d24.jpg",
      "description": "大明风华，郑和下西洋。",
      "is_active": false
    }
  ],
  "events": []
};
