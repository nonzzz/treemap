---

title: Api
level: 2

---

# Api

All the methods and options of the squarified library are documented here.

## Draw Layout Api

The draw layout API is the main API for the treemap. It provides methods to draw the treemap layout.
Now, the draw layout is opinionated and provides a minimalistic API to draw the treemap layout.

### createTreemap

Create a new instance of the treemap. This method returns a new instance of the treemap.

```ts
import { createTreemap } from 'squarified'
const treemap = createTreemap()
```

## Data Transform Api

The data transform API provides methods to transform the data into a format that the treemap can understand.

### c2m

Convert the original data into a format data that the treemap can understand. This method returns a new data format.

```ts
import { c2m } from 'squarified'
const data = [{ name: 'root', value: 100 }, { name: 'root2', value: 50 }, { name: 'root3', value: 150 }]
const transformedData = c2m(data, 'value', (d) => ({ ...d, label: d.name }))
```

### findRelativeNode

Find the relative node of the given node by id. This method returns the relative node of the given node by id.
Note: This function is based on the `visit`.

### findRelativeGraphicNode

Same with `findRelativeNode`

### flattenModule

Flatten the module. This method returns the flattened module.

### getNodeDepth

Get the depth of the node. This method returns the depth of the node.

### sortChildrenByKey

Sort the children by key. This method returns the sorted children by key.

### visit

Walk Nodes.
