import React, { useMemo } from "react";
import { AbsoluteFill, type CalculateMetadataFunction } from "remotion";
import { z } from "zod";
import { Music } from "../../components/Music";
import { beatClock as sharedBeatClock, loadBeatGrid, type BeatGrid as Grid } from "../../core/beat-clock";
import { defineTemplate, type TemplateProps } from "../../core/template";
import { useT } from "../../core/time";
import {
  Prologue,
  Born,
  ParentsGardeners,
  Wing,
  GrowingHappily,
  ThanksParents,
  MeetQingdao,
  LoversPets,
  DaysCounter,
  MemoriesSection,
  TravelSection,
  RitualsSection,
  SeasonsPoem,
  ProposalSection,
  EngagementSection,
  LicenseSection,
  NewChapterSection,
  ThanksGuestsSection,
  FinaleSpotlight,
  type Ctx,
  type PageProps,
} from "./scenes";

/**
 * Bloom · 爱人如养花 — A heartwarming wedding opener in handwritten stickers on black:
 * Prologue ("我们的故事即将开始...") → Birthdays & hometown landmarks with kid standees →
 * Parents vintage photos ("爱人如养花") → Growing up under wing with scattered die-cut stickers →
 * Growing happily (left 2, right 2 with sun) → Thanks to parents (2 horizontal photos + poem) →
 * Meeting in Qingdao (typing year + capsule landmark + youth standees with paper plane) →
 * Becoming lovers & cute pets (dog & cat) → Days counter ("我们携手同行了 1569天") →
 * Memories carousel (Birthday, Concert, First photoshoot) →
 * Travel together (Yunnan, Xinjiang, Qingdao, Hangzhou, Changbai Mountain, Northwest) →
 * Life rituals & surprise gifts → Four seasons poem ("生活被这一个个瞬间点亮") →
 * Proposal ("求婚啦") → Traditional Chinese engagement ("我们订婚啦") →
 * Marriage license 3 columns ("我们领证啦") → New chapter big wedding gown portrait with progressive lines →
 * Guest thanks double portraits → Spotlight finale ("见证我们人生重要的时刻").
 * Planned precisely on 214 beats (matching Mixkit Skyline at 84 BPM; download-only via `npm run music`).
 */

export const bloomSlots = {
  homeGroom: {},
  homeBride: {},
  kidGroom: {},
  kidBride: {},
  parents: { count: 4, min: 2, max: 8 },
  wing: { count: 4, min: 2, max: 8 },
  growing: { count: 4, min: 2, max: 8 },
  parentsThanks: { count: 2, min: 1, max: 4 },
  firstMeet: {},
  meetGroom: {},
  meetBride: {},
  dating: { count: 3, min: 1, max: 6 },
  pets: {},
  memories: { count: 4, min: 1, max: 8 },
  travel: { count: 11, min: 2, max: 16 },
  ritual: { count: 3, min: 1, max: 8 },
  proposal: { count: 2, min: 1, max: 6 },
  engagement: { count: 3, min: 1, max: 6 },
  license: { count: 3, min: 1, max: 6 },
  wedding: { count: 4, min: 2, max: 8 },
} as const;

/** Pages in order with their length in beats (total: 214 beats). */
const PAGES: [id: string, Page: React.FC<PageProps>, beats: number][] = [
  ["prologue", Prologue, 2],
  ["born", Born, 5],
  ["parents", ParentsGardeners, 6],
  ["wing", Wing, 6],
  ["growing", GrowingHappily, 6],
  ["thanksParents", ThanksParents, 9],
  ["meet", MeetQingdao, 11],
  ["dating", LoversPets, 11],
  ["days", DaysCounter, 7],
  ["memories", MemoriesSection, 27],
  ["travel", TravelSection, 48],
  ["ritual", RitualsSection, 9],
  ["seasons", SeasonsPoem, 11],
  ["proposal", ProposalSection, 10],
  ["engagement", EngagementSection, 15],
  ["license", LicenseSection, 6],
  ["wedding", NewChapterSection, 11],
  ["thanksGuests", ThanksGuestsSection, 8],
  ["finale", FinaleSpotlight, 6],
];

/** Page lengths at a pace: each page lasts `beats * pace`. */
const pagedAt = (pace: number) => {
  let at = 0;
  return PAGES.map(([id, Page, beats]) => {
    const len = Math.max(2, Math.round(beats * pace));
    const page = { id, Page, at, len };
    at += len;
    return page;
  });
};

const totalBeats = (pace: number) => pagedAt(pace).reduce((sum, p) => sum + p.len, 0);
const FALLBACK_BPM = 84;
const TAIL = 0.4;

export const COPY = {
  prologueSuffix: { label: "片头 · 我们的故事即将开始", text: "的故事即将开始..." },
  bornTitle: { label: "出生页 · 顶部标题", text: "我们出生啦！！" },
  cityGroom: { label: "新郎家乡城市名", text: "济南" },
  cityBride: { label: "新娘家乡城市名", text: "青岛" },
  yearGroom: { label: "新郎出生年份", text: "2000" },
  yearBride: { label: "新娘出生年份", text: "2001" },
  parentsTitle1: { label: "感恩页 · 第一行粉色大字", text: "爱人如养花" },
  parentsTitle2: { label: "感恩页 · 第二行黄色重点", text: "爸爸妈妈" },
  wingTitle: { label: "呵护页 · 顶部白色文字", text: "在父母的呵护下..." },
  growingTitle1: { label: "成长页 · 顶部粉色文字", text: "我们幸福地" },
  growingTitle2: { label: "成长页 · 底部黄色文字", text: "茁壮成长" },
  thanksP1: { label: "感谢父母 · 第一行", text: "一路上感谢父母的照顾" },
  thanksP2: { label: "感谢父母 · 第二行", text: "谢谢你们赐予我们生命 辛苦把我们养育长大" },
  meetYear: { label: "相识页 · 打字年份", text: "时间来到 2021年..." },
  meetTitle: { label: "相识页 · 主文案", text: "我们相识于青岛" },
  datingDate: { label: "恋爱定情日", text: "2023 11 20" },
  datingDays: { label: "携手同行天数", text: "1569" },
  memoriesPrefix: { label: "记忆章节 · 前缀文字", text: "在这些日子里 我们一起" },
  memoryTag1: { label: "记忆打卡 1", text: "「 庆祝生日 」" },
  memoryTag2: { label: "记忆打卡 2", text: "「 看演唱会 」" },
  memoryTag3: { label: "记忆打卡 3", text: "「 我们的第一套写真 」" },
  travelLeft: { label: "旅行章节 · 左侧竖排", text: "一起去" },
  travelRight: { label: "旅行章节 · 右侧竖排", text: "旅行" },
  travel1: { label: "旅行站点 1", text: "「 打卡云南 」" },
  travel2: { label: "旅行站点 2", text: "「 在新疆 」" },
  travel3: { label: "旅行站点 3", text: "「 去青岛 」" },
  travel4: { label: "旅行站点 4", text: "「 去杭州 」" },
  travel5: { label: "旅行站点 5", text: "「 去长白山 」" },
  travel6: { label: "旅行站点 6", text: "「 去大西北 」" },
  ritualL1: { label: "仪式感 · 第一行", text: "谢谢你从开始到现在" },
  ritualL3: { label: "仪式感 · 第三行", text: "哪怕不是节日也有惊喜" },
  poem1: { label: "四季感悟 · 第一行", text: "我们一起度过了许多个春夏秋冬" },
  poem2: { label: "四季感悟 · 第二行", text: "我们一起成长 一起努力" },
  poem3: { label: "四季感悟 · 第三行", text: "生活被这一个个瞬间点亮" },
  poem4: { label: "四季感悟 · 第四行", text: "不知不觉我们早已是家人般的存在" },
  proposalTag: { label: "求婚标签", text: "「 求婚啦 」" },
  engagementTag: { label: "订婚标签", text: "「 我们订婚啦 」" },
  licenseDate: { label: "领证日期", text: "2026年05月20日" },
  licenseTitle: { label: "领证文案", text: "我们领证啦" },
  thanksGuests: { label: "结尾致谢文案", text: "非常感谢各位来宾 在百忙之中前来参加我们的婚礼" },
  finaleL1: { label: "尾声聚光灯 · 第一行", text: "见证我们" },
  finaleL2: { label: "尾声聚光灯 · 第二行", text: "人生重要的时刻" },
};

type Props = TemplateProps<typeof bloomSlots> & { beatGrid?: Grid | null; pace: number };

const beatClock = (grid: Grid | null | undefined) => {
  const raw = grid?.beats;
  if (raw && raw.length >= 2) {
    const step = raw[raw.length - 1] - raw[raw.length - 2] || 60 / FALLBACK_BPM;
    return (n: number) => {
      if (n <= 0) return Math.max(0, raw[0] + n * (raw[1] - raw[0]));
      const i = Math.floor(n);
      const frac = n - i;
      if (i + 1 < raw.length) return raw[i] + frac * (raw[i + 1] - raw[i]);
      return raw[raw.length - 1] + (n - (raw.length - 1)) * step;
    };
  }
  const at = sharedBeatClock(grid, FALLBACK_BPM);
  return (n: number) => (n >= 0 ? at(n) : Math.max(0, at(0) + n * (at(1) - at(0))));
};

const filmSeconds = (grid: Grid | null | undefined, pace = 1) => beatClock(grid)(totalBeats(pace)) + TAIL;

const Bloom: React.FC<Props> = ({ couple, photos, copy, music, beatGrid, pace = 1 }) => {
  const t = useT();
  const B = useMemo(() => beatClock(beatGrid), [beatGrid]);
  const c: Ctx = useMemo(
    () => ({
      B,
      ph: photos,
      copy,
      groom: couple.groom,
      bride: couple.bride,
      date: couple.date,
    }),
    [B, photos, copy, couple]
  );

  const pages = useMemo(() => pagedAt(pace), [pace]);
  const end = B(totalBeats(pace));
  const live = pages.filter((p, i) => t >= B(p.at - 1) && (i === pages.length - 1 || t < B(p.at + p.len + 0.5)));

  return (
    <AbsoluteFill style={{ background: "#000" }}>
      {live.map(({ id, Page, at, len }) => (
        <Page key={id} c={c} at={at} len={len} />
      ))}
      <AbsoluteFill style={{ background: "#000", opacity: Math.min(1, Math.max(0, (t - (end - 0.3)) / 0.7)) }} />
      <Music music={music} />
    </AbsoluteFill>
  );
};

const beatGridSchema = z.object({ beats: z.array(z.number()) }).nullable().optional();

const definition = defineTemplate(
  {
    id: "VVV-Bloom",
    code: "Bloom",
    title: "爱人如养花",
    slots: bloomSlots,
    seconds: (props) => filmSeconds((props as Props).beatGrid, (props as Props).pace),
    component: Bloom as React.FC<TemplateProps<typeof bloomSlots>>,
    fps: 30,
    copy: COPY,
    poster: 15,
    music: { src: "music/mixkit-skyline.mp3", volume: 0.9, trimBeforeSec: 0, fadeInSec: 0.3, fadeOutSec: 3 },
  },
  {
    schema: {
      beatGrid: beatGridSchema,
      pace: z.number().min(0.8).max(1.2).describe("节奏：每页时长的倍数。1 为默认；1.2 让每页停留更久，全片随之变长"),
    },
    defaults: { beatGrid: null, pace: 1 },
  }
);

const calculateMetadata: CalculateMetadataFunction<any> = async ({ props }) => {
  const parsed = definition.schema.parse(props) as Props;
  const grid = await loadBeatGrid(parsed.music);
  return { durationInFrames: Math.ceil(filmSeconds(grid, parsed.pace) * parsed.fps), props: { ...parsed, beatGrid: grid } };
};

export const bloom = { ...definition, calculateMetadata };
