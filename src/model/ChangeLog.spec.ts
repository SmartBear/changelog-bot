import { assertThat, equalTo } from "hamjest"
import { ChangeLog } from "./ChangeLog"
import { Release } from "./Release"
import { Issue } from "./Issue";

describe(ChangeLog.name, () => {
	it("parses a changelog with a single release", async () => {
    const changeLog = await ChangeLog.parse("## [7.0.0](https://github.com/cucumber/cucumber-ruby/compare/v6.1.0...v7.0.0) (2021-07-19)")
    assertThat(changeLog.releases[0], equalTo(new Release('7.0.0', [])))
  })

  it("parses a changelog with a single release and a single issue", async () => {
    const content = `
## [7.0.0](https://github.com/cucumber/cucumber-ruby/compare/v6.1.0...v7.0.0) (2021-07-19)
### Added
* Add a feature, fixes #1
    `;
    const changeLog = await ChangeLog.parse(content)
    assertThat(changeLog.releases[0], equalTo(new Release('7.0.0', [new Issue(1)])))
  })

  it("parses a changelog with multiple releases and multiple issues", async () => {
    const content = `
## [7.0.0](https://github.com/cucumber/cucumber-ruby/compare/v6.1.0...v7.0.0) (2021-07-19)
### Added
* Add a feature, fixes (#1)
* Add a feature, fixes (#2)
## [6.1.0](https://github.com/cucumber/cucumber-ruby/compare/v5.1.0...v6.1.0) (2020-07-19)
### Added
* Add a feature, fixes [#3]
* Add a feature, fixes #4
    `;
    const changeLog = await ChangeLog.parse(content)
    assertThat(changeLog.releases[0], equalTo(new Release('7.0.0', [new Issue(1), new Issue(2)])))
    assertThat(changeLog.releases[1], equalTo(new Release('6.1.0', [new Issue(3), new Issue(4)])))
  })
})
