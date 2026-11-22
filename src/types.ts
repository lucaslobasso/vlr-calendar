export interface MatchInfo {
  id: string;
  url: string; // absolute https://www.vlr.gg/<id>/<slug>
  team1: string;
  team2: string;
  tag1?: string; // short team tag, e.g. "FLY"
  tag2?: string;
  region?: string; // VCT region, e.g. "Americas"
  event?: string;
  stage?: string;
  bestOf?: 1 | 3 | 5;
  eventUrl?: string; // https://www.vlr.gg/event/<id>/<slug>
  team1Url?: string;
  team2Url?: string;
  startUtc: Date;
  upcoming: boolean;
}
