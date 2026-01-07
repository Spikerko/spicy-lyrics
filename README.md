# Spicy Lyrics

#### Check out our [YourSite.ee](https://yoursit.ee/lyrics)!

## How to install Spicy Lyrics Externally!
1. Make sure to have [Spicetify](https://spicetify.app) installed
2. Download the [spicy-lyrics.mjs](./builds/spicy-lyrics.mjs) file
3. Put the file inside the Spicetify Extensions directory. Find the correct directory here: [https://spicetify.app/docs/advanced-usage/extensions](https://spicetify.app/docs/advanced-usage/extensions)
4. Then, run ```spicetify config extensions spicy-lyrics.mjs```
5. Then apply Spicetify by running ```spicetify apply```
6. All done!

## Installing Spicy Lyrics using Spicetify nix
1. Make sure you have Spicetify-nix installed according to the instructions at [https://gerg-l.github.io/spicetify-nix/usage.html](https://gerg-l.github.io/spicetify-nix/usage.html)
2. Add Spicy Lyrics to the extensions like this:

```nix
enabledExtensions = [
  ({
    src =
      pkgs.fetchFromGitHub {
        owner = "Spikerko";
        repo = "spicy-lyrics";
        # Edit the revision and hash as needed.
        rev = "2de7a609bdead1ade90addde2b1d551d4b87e87a";
        hash = "sha256-VEMxk9Hjtuh5fRYt0LzOhkd34sr2i6e6FFM55FJHz98=";
      }
      + "/builds";
    name = "spicy-lyrics.mjs";
  })
];
```

[![Github Version](https://img.shields.io/github/v/release/spikerko/spicy-lyrics)](https://github.com/spikerko/spicy-lyrics/) [![Github Stars badge](https://img.shields.io/github/stars/spikerko/spicy-lyrics?style=social)](https://github.com/spikerko/spicy-lyrics/) [![Discord Badge](https://dcbadge.limes.pink/api/server/uqgXU5wh8j?style=flat)](https://discord.com/invite/uqgXU5wh8j)

Hi, I'm Spikerko (the person who made this repo). I've been really passionate about this project, and I'm really happy for this project.

I've seen a problem with the Spotify Lyrics. They're plain, just static colors. So I wanted to build my own version. And here it is: **Spicy Lyrics**. Hope you like it!

![Extension Example](./previews/page.gif)


*Inspired by [Beautiful Lyrics](https://github.com/surfbryce/beautiful-lyrics) by [@surfbryce](https://github.com/surfbryce)*
