export interface MatchInfo {
  id: string;
  url: string; // absolute https://www.vlr.gg/<id>/<slug>
  team1: string;
  team2: string;
  event?: string;
  stage?: string;
  bestOf?: 1 | 3 | 5;
  startUtc: Date;
  upcoming: boolean;
}
