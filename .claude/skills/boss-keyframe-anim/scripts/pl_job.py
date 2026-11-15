"""pl_job.py <endpoint> <body.json> <out.json> : POST then poll background job, save final job json"""
import sys,json,time,subprocess
ep,bf,of=sys.argv[1:4]
H_=["-H","Authorization: Bearer proxy-injected","-H","Content-Type: application/json"]
r=json.loads(subprocess.run(["curl","-sS","-m","120","-X","POST","https://api.pixellab.ai/v2/"+ep,*H_,"--data-binary","@"+bf],capture_output=True).stdout)
print({k:v for k,v in r.items() if k not in('images',)})
jid=r.get("background_job_id")
if not jid: sys.exit("request refused: "+json.dumps(r)[:800])
while jid:
    d=json.loads(subprocess.run(["curl","-sS","-m","30","https://api.pixellab.ai/v2/background-jobs/"+jid,*H_],capture_output=True).stdout)
    if d["status"] not in("processing","queued","pending"): break
    time.sleep(6)
json.dump(d,open(of,"w")); lr=d.get("last_response") or {}
print(d["status"],lr.get("usage"),lr.get("detail"),lr.get("message"),lr.get("files"))
