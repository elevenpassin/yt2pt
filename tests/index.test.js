function add(a, b) {
  return a + b;
}

test('add function', () => {
  expect(add(1, 2)).toEqual(1 + 2)
})
