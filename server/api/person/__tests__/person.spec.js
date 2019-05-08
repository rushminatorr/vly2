import test from 'ava'
import request from 'supertest'
import { server, mongoose, start } from '../../../server'
import Person from '../person'
import MongodbMemoryServer from 'mongodb-memory-server'

const mongod = new MongodbMemoryServer() // Start MongoDB Instance

// Initial people added into test db
const people = [
  {
    name: 'ANDREW WATKINS',
    moniker: 'Andrew',
    email: 'andrew@omgtech.co.nz',
    phone: '027 7031007',
    role: ['tester']
  },
  {
    name: 'WALTER LIM',
    moniker: 'Walt',
    phone: '027 7031007',
    email: 'walter@omgtech.co.nz',
    role: ['tester']
  }
]

test.before(async t => {
  const connection = await mongod.getConnectionString()
  await mongoose.connect(connection, { useNewUrlParser: true })
    .then(console.log('Test mongodb connected at:', connection))
  const db = mongoose.connection
  db.on('error', console.error.bind(console, 'connection error:'))

  await start()
})
// Disconnect MongoDB and mongoose after all tests are done
test.after.always(async t => {
  mongoose.disconnect()
  mongod.stop()
})

test.beforeEach('connect and add two person entries', async () => {
  await Person.create(people).catch(() => 'Unable to create people')
})

test.afterEach.always(async () => {
  await Person.deleteMany()
})

test.only('verify server health', async t => {
  const res = await request(server)
    .get('/health')
    .expect(200)
  t.is(res.body, 'Health OK')
})

test.serial('verify fixture database has people', async t => {
  const count = await Person.countDocuments()
  t.is(count, 2)

  // can find by email with then
  await Person.findOne({ email: 'andrew@omgtech.co.nz' }).then((person) => {
    t.is(person.moniker, 'Andrew')
  })

  await Person.find().then((p) => {
    t.is(people.length, p.length)
  })
})

test.serial('Should correctly give number of people', async t => {
  const res = await request(server)
    .get('/api/people')
    .set('Accept', 'application/json')
    .expect(200)
    .expect('Content-Type', /json/)

  t.is(people.length, res.body.length)
})

test.serial('Should send correct data when queried against an id', async t => {
  t.plan(1)
  const p = {
    name: 'Testy McTestFace',
    moniker: 'Testy',
    phone: '123 456789',
    email: 'query@omgtech.co.nz',
    role: ['tester']
  }

  const person = new Person(p)
  await person.save()
  const id = person._id

  const res = await request(server)
    .get(`/api/people/${id}`)
    .set('Accept', 'application/json')
    .expect('Content-Type', /json/)
    .expect(200)

  t.is(res.body.name, p.name)
})

test.serial('Should correctly add a person', async t => {
  t.plan(3)

  const p = {
    name: 'Testy McTestFace',
    moniker: 'Testy',
    phone: '123 456789',
    email: 'addy@omgtech.co.nz',
    gender: 'binary',
    role: ['tester']
  }

  const res = await request(server)
    .post('/api/people')
    .send(p)
    .set('Accept', 'application/json')
    .expect(200)

  try {
  // can find by id
    const id = res.body._id
    await Person.findById(id).then((person) => {
    // console.log('findById:', person)
      t.is(id, person._id.toString())
    })

    // can find by email with then
    await Person.findOne({ email: p.email }).then((person) => {
      t.is(person.name, p.name)
    })

    // can find by email using await
    const savedPerson = await Person.findOne({ email: p.email }).exec()
    t.is(savedPerson.name, p.name)
  } catch (err) {
    console.log(err)
  }
})

test.serial('Should correctly add a person and sanitise inputs', async t => {
  const p = {
    name: 'Bobby; DROP TABLES', // is allowed
    moniker: '<b>SQLINJECTOR</b>',
    phone: "1234<img src=x onerror=alert('img') />ABCD", // should remove img
    email: 'bobby@omgtech.co.nz', // ok
    gender: "console.log('hello world')", // ok
    role: ['tester']
  }

  await request(server)
    .post('/api/people')
    .send(p)
    .set('Accept', 'application/json')
    .expect(200)

  const savedPerson = await Person.findOne({ email: p.email }).exec()
  t.is(savedPerson.phone, '1234ABCD')
})

test.serial('Should load a person into the db and delete them via the api', async t => {
  t.plan(2)
  const p = {
    name: 'Testy McTestFace',
    moniker: 'Testy',
    phone: '123 456789',
    email: 'loady@omgtech.co.nz',
    gender: 'binary',
    role: ['tester']
  }
  const person = new Person(p)
  await person.save()
  const id = person._id

  // check person is there.
  const res = await request(server)
    .get(`/api/people/${id}`)
    .set('Accept', 'application/json')
    .expect('Content-Type', /json/)
    .expect(200)

  t.is(res.body.name, p.name)

  // delete the record
  await request(server)
    .delete(`/api/people/${person._id}`)
    .set('Accept', 'application/json')
    .expect(200)

  // check person is gone
  const queriedPerson = await Person.findOne({ email: p.email }).exec()
  t.is(queriedPerson, null)
})
