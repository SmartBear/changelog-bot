import { Issue } from './Issue'

export class Release {
  constructor(
    public name: string,
    public heading: string,
    public issues: Issue[]
  ) {}
}
