import { assertThat, equalTo } from "hamjest"
import { ChangeLog } from "./ChangeLog"
import { Release } from "./Release"

describe(ChangeLog.name, () => {
	it("parses a changelog with a single release", () => {
    const changeLog = ChangeLog.parse("## [7.0.0](https://github.com/cucumber/cucumber-ruby/compare/v6.1.0...v7.0.0) (2021-07-19)")
    assertThat(changeLog.releases[0], equalTo(new Release('7.0.0', [])))
  })
})
