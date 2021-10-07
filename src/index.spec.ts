/* eslint-disable @typescript-eslint/no-var-requires */
import nock from 'nock'
// Requiring our app implementation
import app from '.'
import { Probot, ProbotOctokit } from 'probot'
import { readFileSync } from 'fs'
import { join, resolve } from 'path'
import { assertThat, equalTo } from 'hamjest'
// Requiring our fixtures
// const issueCreatedBody = { body: "Thanks for opening this issue!" };
import payload from '../test/fixtures/push.update-changelog.json'
import payloadNoChanges from '../test/fixtures/push.not-updating-changelog.json'
import installationPayload from '../test/fixtures/installation.created.json'

const privateKey = readFileSync(
  join(__dirname, '../test/fixtures/mock-cert.pem'),
  'utf-8'
)

describe('ChangeBot', () => {
  let probot: Probot

  beforeEach(() => {
    nock.disableNetConnect()
    probot = new Probot({
      appId: 123,
      privateKey,
      // disable request throttling and retries for testing
      Octokit: ProbotOctokit.defaults({
        retry: { enabled: false },
        throttle: { enabled: false }
      })
    })
    probot.load(app)
  })

  describe('when a push is received', () => {
    context('when none of the commits touch the changelog', async () => {
      it('does nothing', async () => {
        await probot.receive({
          id: 'push',
          name: 'push',
          payload: payloadNoChanges
        })
      })
    })
  })

  it('creates a comment on every issue in the CHANGELOG.md', async () => {
    const mock = nock('https://api.github.com')
      .get('/app')
      .replyWithFile(
        200,
        resolve(__dirname, '../test/fixtures/response-app.json'),
        { 'content-type': 'application/json; charset=utf-8' }
      )
      .post('/app/installations/19899812/access_tokens')
      .reply(
        200,
        {
          token: 'test',
          permissions: {
            contents: 'read',
            issues: 'write',
            metadata: 'read',
            pull_requests: 'write'
          }
        },
        { 'content-type': 'application/json; charset=utf-8' }
      )
      .get('/repos/SmartBear/changelog-bot-test/contents/CHANGELOG.md')
      .query({ ref: '4a04b239c9f2c6f3876169a1100bb41156bdbde7' })
      .replyWithFile(
        200,
        resolve(__dirname, '../test/fixtures/response-changelog-content.json'),
        { 'content-type': 'application/json; charset=utf-8' }
      )
      .get('/repos/SmartBear/changelog-bot-test/issues/1/comments')
      .replyWithFile(
        200,
        resolve(__dirname, '../test/fixtures/response-issue-comments.json'),
        { 'content-type': 'application/json; charset=utf-8' }
      )
      .post('/repos/SmartBear/changelog-bot-test/issues/1/comments',
        /This was released in \[1.0.0]\(https:\/\/github.com\/SmartBear\/changelog-bot-test\/blob\/main\/CHANGELOG.md#100\)/)
      .reply(200)
    await probot.receive({ id: 'push', name: 'push', payload })
    assertThat(mock.pendingMocks(), equalTo([]))
  })

  describe('when the app is installed', () => {
    it('creates pull request on installation if there is no CHANGELOG.md in the repo', async () => {
      const mock = nock('https://api.github.com')
        .post('/app/installations/19940111/access_tokens')
        .reply(
          200,
          {
            token: 'test',
            permissions: {
              contents: 'read',
              issues: 'write',
              metadata: 'read',
              pull_requests: 'write'
            }
          },
          { 'content-type': 'application/json; charset=utf-8' }
        )
        .get('/repos/SmartBear/changelog-bot-test')
        .reply(200, { default_branch: 'main' })
        .get('/repos/SmartBear/changelog-bot-test/contents/CHANGELOG.md')
        .query({ ref: 'main' })
        .reply(404)
        .get('/repos/SmartBear/changelog-bot-test/git/ref/heads%2Fmain')
        .replyWithFile(
          200,
          resolve(__dirname, '../test/fixtures/response-main-ref.json'),
          { 'content-type': 'application/json; charset=utf-8' }
        )
        .post('/repos/SmartBear/changelog-bot-test/git/refs', {
          ref: 'refs/heads/smartbear/changebot/add-changelog',
          sha: 'aa218f56b14c9653891f9e74264a383fa43fefbd'
        })
        .reply(201, {
          ref: 'refs/heads/smartbear/changebot/add-changelog',
          node_id: 'MDM6UmVmcmVmcy9oZWFkcy9mZWF0dXJlQQ==',
          url: 'https://api.github.com/repos/SmartBear/changelog-bot-test/git/refs/heads/smartbear/changebot/add-changelog',
          object: {
            type: 'commit',
            sha: 'aa218f56b14c9653891f9e74264a383fa43fefbd',
            url: 'https://api.github.com/repos/SmartBear/changelog-bot-test/git/commits/aa218f56b14c9653891f9e74264a383fa43fefbd'
          }
        })
        .put('/repos/SmartBear/changelog-bot-test/contents/CHANGELOG.md', {
          message: 'A new and shiny changelog',
          content: readFileSync(join(__dirname, 'CHANGELOG.md')).toString(
            'base64'
          ),
          branch: 'smartbear/changebot/add-changelog'
        })
        .reply(200)
        .post('/repos/SmartBear/changelog-bot-test/pulls', {
          title: 'Keep A ChangeLog!',
          head: 'smartbear/changebot/add-changelog',
          base: 'main',
          body: "You don't currently have a CHANGELOG.md file, this PR fixes that!"
        })
        .reply(201)

      await probot.receive({
        id: 'installation',
        name: 'installation.created',
        payload: installationPayload
      })

      assertThat(mock.pendingMocks(), equalTo([]))
    })
  })

  afterEach(() => {
    nock.cleanAll()
    nock.enableNetConnect()
  })
})

// For more information about testing with Jest see:
// https://facebook.github.io/jest/

// For more information about using TypeScript in your tests, Jest recommends:
// https://github.com/kulshekhar/ts-jest

// For more information about testing with Nock see:
// https://github.com/nock/nock
