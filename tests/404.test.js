const app = require('../app')
const server = app.listen()
const request = require('supertest').agent(server)

describe('404', () => {
  afterAll(() => {
    server.close();
  });

  it('should return 404 for undefined GET routes', async () => {
    const response = await request
      .set('Accept', 'application/json')
      .get('/332nx1')
    expect(response.status).toEqual(404)
    expect(response.type).toEqual("application/json")
    expect(response.body).toEqual({
      message: 'Page Not Found'
    })
  })

  it('should return 404 for undefined POST routes', async () => {
    const response = await request
      .set('Accept', 'application/json')
      .post('/332nx1')
    expect(response.status).toEqual(404)
    expect(response.type).toEqual("application/json")
    expect(response.body).toEqual({
      message: 'Page Not Found'
    })
  })

  it('should return 404 for undefined PUT routes', async () => {
    const response = await request
      .set('Accept', 'application/json')
      .put('/332nx1')
    expect(response.status).toEqual(404)
    expect(response.type).toEqual("application/json")
    expect(response.body).toEqual({
      message: 'Page Not Found'
    })
  })

  it('should return 404 for undefined delete routes', async () => {
    const response = await request
      .set('Accept', 'application/json')
      .delete('/332nx1')
    expect(response.status).toEqual(404)
    expect(response.type).toEqual("application/json")
    expect(response.body).toEqual({
      message: 'Page Not Found'
    })
  })

  it('should return 404 for responses with response type: text/html to undefined routes', async () => {
    const response = await request
      .set('Accept', 'text/html')
      .delete('/332nx1')
    expect(response.status).toEqual(404)
    expect(response.type).toEqual("text/html")
    expect(response.text).toEqual("<p>Page Not Found</p>")
  })

  it('should return 404 for responses with response type: text/plain to undefined routes', async () => {
    const response = await request
      .set('Accept', 'text/plain')
      .delete('/332nx1')
    expect(response.status).toEqual(404)
    expect(response.type).toEqual("text/plain")
    expect(response.text).toEqual("Page Not Found")
  })
})