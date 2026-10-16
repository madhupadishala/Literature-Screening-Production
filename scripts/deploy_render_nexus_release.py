#!/usr/bin/env python3
"""Sync the existing Render service to the reviewed Vercel release.

Reads RENDER_API_KEY from the runner environment; never prints it.
Does not modify environment variables, clinical gates, plan, or service count.
"""
import argparse
import json
import os
import urllib.error
import urllib.request

SERVICE = 'srv-db5o1a7lk1mc73all2gg'
WORKSPACE = 'tea-db5n2f5ckfvc73ap55dg'
REPO = 'https://github.com/madhupadishala/Literature-Screening-Production'
BRANCH = 'fix/auth-tenancy-audit-20261017'
COMMIT = '52fba8cc1bc971599d0badfe75e36aa593a6f8c3'
PATCH = {
    'branch': BRANCH,
    'autoDeployTrigger': 'off',
    'serviceDetails': {
        'healthCheckPath': '/healthz',
        'envSpecificDetails': {
            'buildCommand': 'pip install -r backend/services/pv_agents/requirements-render.txt',
            'startCommand': 'gunicorn backend.services.pv_agents.render_wsgi:application --bind 0.0.0.0:$PORT --workers 1 --timeout 120 --access-logfile - --error-logfile - --capture-output',
        },
    },
}
DEPLOY = {'commitId': COMMIT, 'clearCache': 'do_not_clear'}

def request(method, suffix='', payload=None):
    token = os.environ.get('RENDER_API_KEY')
    if not token:
        raise RuntimeError('RENDER_API_KEY must be injected into the runner environment')
    req = urllib.request.Request('https://api.render.com/v1/services/' + SERVICE + suffix,
        method=method, data=json.dumps(payload).encode() if payload is not None else None,
        headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json', 'Accept': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        # Avoid echoing response bodies containing environment or diagnostic data.
        raise RuntimeError(f'Render {method} failed with HTTP {error.code}') from None

def deploy():
    current = request('GET')
    if current.get('id') != SERVICE or current.get('ownerId') != WORKSPACE or current.get('repo', '').removesuffix('.git') != REPO:
        raise RuntimeError('Unexpected service/workspace/repository; no changes made')
    request('PATCH', payload=PATCH)
    verified = request('GET')
    details = verified.get('serviceDetails', {})
    if verified.get('branch') != BRANCH or details.get('healthCheckPath') != '/healthz':
        raise RuntimeError('Settings verification failed; deploy not triggered')
    result = request('POST', '/deploys', DEPLOY)
    print(json.dumps({'serviceId': SERVICE, 'deployId': result.get('id'), 'commit': COMMIT, 'status': result.get('status')}))
    return result

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dry-run', action='store_true', help='Print non-secret deployment payloads without contacting Render')
    args = parser.parse_args()
    if args.dry_run:
        print(json.dumps({'serviceId': SERVICE, 'patch': PATCH, 'deploy': DEPLOY}, indent=2))
        return
    deploy()

if __name__ == '__main__':
    main()
