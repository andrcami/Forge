---
name: portable-lesson-file
description: Turn an incident note into a library lesson file, in the library's format
tags: [lessons, smoke]
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
---

I use Forge's lesson library. Write this up as a portable lesson file for the library, ready to save. Don't save it, just give me the file content.

What happened, in project `relay`, PR #12, today: our Go webhook handler parsed the JSON body into a struct, then re-marshalled it and checked the HMAC signature over that. Every real delivery failed the check, because re-encoding changes the bytes. The fix was to verify the signature over the raw request body before parsing.
