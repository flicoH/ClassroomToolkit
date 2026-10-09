#!/usr/bin/env python3
"""Validate rendered Compose JSON without printing deployment credentials."""
import argparse
import base64
import ipaddress
import json
import os
import re
import secrets
from pathlib import Path
from urllib.parse import urlparse


def validate(config):
    services = config['services']
    runtime = ['mysql', 'backend', 'web', 'admin']
    total = sum(int(services[name]['mem_limit']) for name in runtime)
    if total > 1408 * 1024 * 1024:
        raise ValueError('Runtime memory limits exceed the 2GB deployment budget')
    if sum(float(services[name]['cpus']) for name in runtime) > 2:
        raise ValueError('Runtime CPU limits exceed two cores')
    if 'docling-parser' in services:
        raise ValueError('Docling must run on an independent host in this profile')
    for name in runtime:
        if float(services[name]['cpus']) <= 0:
            raise ValueError('Each service needs a CPU limit')
        for port in services[name].get('ports', []):
            if port.get('host_ip') != '127.0.0.1':
                raise ValueError('Service ports must bind to localhost')
    if services['mysql'].get('ports'):
        raise ValueError('MySQL must not publish a host port')
    env = services['backend']['environment']
    for field in ['MYSQL_PASSWORD', 'REPORT_SHARE_ENCRYPTION_KEY']:
        value = env.get(field, '')
        if not value or 'CHANGE_ME' in value:
            raise ValueError(f'Fill {field} in the environment file')
    root = services['mysql']['environment'].get('MYSQL_ROOT_PASSWORD', '')
    if not root or 'CHANGE_ME' in root or root == env['MYSQL_PASSWORD']:
        raise ValueError('Use distinct non-placeholder MySQL root and app passwords')
    try:
        key = base64.b64decode(env['REPORT_SHARE_ENCRYPTION_KEY'], validate=True)
    except ValueError:
        raise ValueError('Report encryption key must be base64') from None
    if len(key) != 32:
        raise ValueError('Report encryption key must decode to 32 bytes')
    public = urlparse(env.get('REPORT_PUBLIC_BASE_URL', ''))
    if public.scheme != 'https' or not public.hostname or public.hostname == 'example.com' or public.hostname.endswith('.example.com') or public.path not in ['', '/'] or public.query or public.fragment or public.username:
        raise ValueError('REPORT_PUBLIC_BASE_URL must be your real HTTPS website root URL')
    provider = env.get('SEMESTER_REPORT_PARSER_PROVIDER') or 'kimi'
    if provider == 'kimi':
        key = env.get('KIMI_API_KEY', '').strip()
        if not key or 'CHANGE_ME' in key or any(c.isspace() for c in key):
            raise ValueError('Fill KIMI_API_KEY in the environment file')
        base = urlparse(env.get('KIMI_BASE_URL') or 'https://api.moonshot.cn/v1')
        if base.scheme != 'https' or not base.hostname or base.username or base.password or base.query or base.fragment or base.path.rstrip('/') != '/v1':
            raise ValueError('KIMI_BASE_URL must be an HTTPS /v1 endpoint without embedded credentials')
    elif provider == 'docling':
        if not env.get('SEMESTER_REPORT_PARSER_API_KEY') or 'CHANGE_ME' in env['SEMESTER_REPORT_PARSER_API_KEY']:
            raise ValueError('Fill SEMESTER_REPORT_PARSER_API_KEY for Docling')
        parser = urlparse(env.get('SEMESTER_REPORT_PARSER_URL', ''))
        if not parser.hostname or parser.hostname == 'example.com' or parser.hostname.endswith('.example.com') or parser.path != '/parse' or parser.username or parser.query or parser.fragment:
            raise ValueError('Configure the independent Docling adapter /parse endpoint')
        if parser.scheme != 'https':
            try:
                address = ipaddress.ip_address(parser.hostname)
                private = address.is_private and not (address.is_loopback or address.is_unspecified or address.is_link_local)
            except ValueError:
                private = False
            if parser.scheme != 'http' or not private:
                raise ValueError('Docling needs HTTPS, or HTTP over a private IP network')
        try:
            local_parser = ipaddress.ip_address(parser.hostname).is_loopback
        except ValueError:
            local_parser = parser.hostname == 'localhost'
        if local_parser:
            raise ValueError('Parser localhost inside the backend container is not a separate Docling host')
    else:
        raise ValueError('SEMESTER_REPORT_PARSER_PROVIDER must be docling or kimi')
    for name in ['backend', 'web', 'admin']:
        if not re.search(r':sha-[a-f0-9]{40}$', services[name]['image']):
            raise ValueError('Use immutable sha-<40-character commit> image tags')
    if env.get('REPORT_GENERATION_MODE') != 'template':
        raise ValueError('The 2GB profile must use template reports')
    admin_password = env.get('ADMIN_INITIAL_PASSWORD', '')
    admin_username = env.get('ADMIN_INITIAL_USERNAME', '')
    if bool(admin_username) != bool(admin_password) or (admin_password and (not admin_username.strip() or len(admin_username) > 64 or not 12 <= len(admin_password) <= 256 or 'CHANGE_ME' in admin_password)):
        raise ValueError('Set both ADMIN_INITIAL_USERNAME and a 12+ character password, or clear both for an existing administrator')
    return total


def initialize(template, target):
    target = Path(target)
    replacements = {
        'CHANGE_ME_ROOT_PASSWORD': secrets.token_hex(24),
        'CHANGE_ME_APP_PASSWORD': secrets.token_hex(24),
        'CHANGE_ME_ADMIN_PASSWORD': secrets.token_hex(24),
        'CHANGE_ME_PARSER_KEY': secrets.token_hex(32),
        'CHANGE_ME_REPORT_KEY': base64.b64encode(secrets.token_bytes(32)).decode(),
    }
    text = Path(template).read_text()
    for before, after in replacements.items():
        text = text.replace(before, after)
    # Never overwrite keys or passwords on repeat initialization.
    fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as stream:
        stream.write(text)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('config', nargs='?')
    parser.add_argument('--init', metavar='ENV_FILE')
    parser.add_argument('--template')
    args = parser.parse_args()
    if args.init:
        if not args.template:
            parser.error('--template is required with --init')
        initialize(args.template, args.init)
        print('Created environment file with mode 0600; fill the website URL and KIMI_API_KEY (or independent Docling settings).')
    else:
        if not args.config:
            parser.error('Compose JSON file is required')
        total = validate(json.loads(Path(args.config).read_text()))
        print(f'Configuration valid; runtime memory limit total: {total // (1024 * 1024)} MiB.')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, KeyError) as error:
        raise SystemExit(str(error)) from None
