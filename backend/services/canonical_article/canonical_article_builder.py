def build(package_folder):

    metadata = load_metadata()

    abstract = load_abstract()

    full_text = load_best_available_text()

    article = CanonicalArticle(...)

    article.combined_text = (
        article.title
        + "\n\n"
        + abstract
        + "\n\n"
        + full_text
    )

    save(article)