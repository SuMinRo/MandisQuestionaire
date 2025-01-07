from tqdm import tqdm
import numpy as np
import sys
from KernelGeneration import spatial_receptive_field
import torch

data = np.load(sys.argv[1])

headers = ["id", "Scale", "TimeConstant", "Angle", "Ratio", "dx", "dy", "Activity", "timestep"]
combine = True

t = 0
f = open("realkernels.tsv", "w")
f.write('\t'.join(headers) + "\n")

for timestep in data:
    id = 0

    for kernel in timestep:
        array = np.ndarray.tolist(kernel)
        arrayString = [str(s) for s in array]
        arrayString.append(str(t))
        arrayString = "\t".join(arrayString)
        f.write(str(id) + "\t" + arrayString + "\n")
        id += 1

    t += 1

f.close()

print(t, "processed and made ready for visualisation.")




# Image values generation
print("Processing kernel image data...")

headers = ["id", "values", "timestep"]

f = open("kernelImageData.tsv", "w")
f.write('\t'.join(headers) + "\n")

t = 0

for timestep in tqdm(data):
    id = 0

    for kernel in timestep:
        data_t = torch.Tensor(data[t])
        image = spatial_receptive_field(data_t[id][0], data_t[id][1], data_t[id][2], 5, data_t[id][3], data_t[id][4])
        array = np.ndarray.tolist(kernel)
        f.write(str(id)+"\t")
        for i in range(image.shape[0]):
            arrayString = []
            for j in range(image.shape[1]):
                arrayString.append(str(image[i][j].item()))
            f.write(",".join(arrayString)+'; ')
        f.write("\t"+str(t)+"\n")
        id += 1

    t += 1

f.close()