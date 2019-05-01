const app = require('../app')
const server = app.listen()
const request = require('supertest').agent(server)

describe('routes: index', () => {
  afterAll(() => {
    server.close();
  });

  it('GET index', async () => {
    const response = await request.get('/')
    expect(response.status).toEqual(200)
    expect(response.type).toEqual("text/plain")
    expect(response.text).toEqual('Hello world')
  })
})