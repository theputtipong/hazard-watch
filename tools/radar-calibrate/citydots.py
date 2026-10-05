"""Bounds from towns drawn on a radar image: least-squares lon = a + b*x, lat = c + d*y.
Usage: python3 citydots.py '[[x, y, lat, lon], ...]' <width>,<height>
Pixel x/y are the town dots on the image; residuals (km) show whether the image is a plain lat/lon grid."""
import sys,json
def fit(xs,ys):
    n=len(xs);mx=sum(xs)/n;my=sum(ys)/n
    b=sum((x-mx)*(y-my) for x,y in zip(xs,ys))/sum((x-mx)**2 for x in xs);return my-b*mx,b
P=json.loads(sys.argv[1]);W,H=map(int,sys.argv[2].split(','))
a,b=fit([p[0] for p in P],[p[3] for p in P]);c,d=fit([p[1] for p in P],[p[2] for p in P])
print('lon/px %.5f lat/px %.5f'%(b,d))
for p in P: print(' res km', round((p[3]-(a+b*p[0]))*108,1), round((p[2]-(c+d*p[1]))*111,1))
print(json.dumps([[round(c+d*H,4),round(a,4)],[round(c,4),round(a+b*W,4)]]))
